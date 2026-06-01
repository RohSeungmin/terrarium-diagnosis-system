/*
 * diagnosis.c
 *
 * 역할:
 * - 수집된 센서 데이터를 바탕으로 진단 지표를 계산하는 모듈
 * - Lmatch, Lgrad, Lsafety를 계산하고 최종 진단 레벨을 산출함
 * - 센서 이상 조건이 있으면 device fault 후보도 판정함
 * 
 */

#include "diagnosis.h"
#include "preprocess.h"

#include <math.h>
#include <stddef.h>
#include <string.h>

// 기본 진단 설정값
// 사육환경 기준은 diagnosis에서만 관리한다.
// RSPCA/ReptiFiles 기준상 표면 온도와 공기 온도는 서로 다른 기준이므로 섞지 않는다.
#define DIAGNOSIS_DEFAULT_HEAT_RESPONSE_WARNING_TIME_MS 60000U
#define DIAGNOSIS_DEFAULT_HEAT_RESPONSE_CRITICAL_TIME_MS 180000U
#define DIAGNOSIS_DEFAULT_HEAT_RESPONSE_THRESHOLD_C 2.0f
#define DIAGNOSIS_DEFAULT_BASKING_SURFACE_TARGET_MIN_C 42.0f
#define DIAGNOSIS_DEFAULT_AIR_GRADIENT_NORMAL_THRESHOLD_C 10.0f
#define DIAGNOSIS_DEFAULT_AIR_GRADIENT_CRITICAL_THRESHOLD_C 5.0f
#define DIAGNOSIS_DEFAULT_HOT_SURFACE_TEMP_WARN_C 45.0f
#define DIAGNOSIS_DEFAULT_HOT_SURFACE_TEMP_CRIT_C 50.0f

// diagnosis_is_valid_config:
// 진단 설정값이 사용할 수 있는 범위인지 확인하는 함수
static bool diagnosis_is_valid_config(const diagnosis_config_t *config)
{
    if (config == NULL) {
        return false;
    }

    return config->heat_response_warning_time_ms > 0 &&
           config->heat_response_critical_time_ms >= config->heat_response_warning_time_ms &&
           isfinite(config->heat_response_threshold_c) &&
           config->heat_response_threshold_c > 0.0f &&
           isfinite(config->basking_surface_target_min_c) &&
           isfinite(config->air_gradient_normal_threshold_c) &&
           isfinite(config->air_gradient_critical_threshold_c) &&
           config->air_gradient_critical_threshold_c <= config->air_gradient_normal_threshold_c &&
           isfinite(config->hot_surface_temp_warn_c) &&
           isfinite(config->hot_surface_temp_crit_c) &&
           config->hot_surface_temp_warn_c <= config->hot_surface_temp_crit_c;
}

// diagnosis_calculate_l_match:
// 열원 작동과 실제 온도 반응의 일치도를 계산하는 함수
static diagnosis_level_t diagnosis_calculate_l_match(const diagnosis_config_t *config,
                                                      const preprocess_result_t *result)
{
    // Heat source가 ON 상태가 아니면 L_match = 0 (정상)
    if (!result->feature.heat_source_state_ok || !result->feature.heat_source_on) {
        return DIAGNOSIS_LEVEL_NORMAL;
    }

    // Heat source ON 시간이 충분하지 않으면 판단 보류 (L_match = 0)
    if (result->feature.heat_source_on_duration_ms < config->heat_response_warning_time_ms) {
        return DIAGNOSIS_LEVEL_NORMAL;
    }

    // 표면 온도 상승량을 확인할 수 없으면 판단 불가 (L_match = 0)
    if (!result->feature.surface_temp_rise_since_heat_on_ok) {
        return DIAGNOSIS_LEVEL_NORMAL;
    }

    const bool poor_surface_rise =
        result->feature.surface_temp_rise_since_heat_on_c < config->heat_response_threshold_c;
    const bool below_target_surface_temp =
        result->cleaned.hot_surface_ok &&
        result->cleaned.hot_surface_temp_c < config->basking_surface_target_min_c;

    // 60초/180초/2.0C/42C는 시제품 실험으로 보정할 후보값이다.
    if (result->feature.heat_source_on_duration_ms >= config->heat_response_critical_time_ms &&
        (poor_surface_rise || below_target_surface_temp)) {
        return DIAGNOSIS_LEVEL_CRITICAL;
    }

    // 표면 온도 상승량이 충분하지 않으면 경고 (L_match = 1)
    if (poor_surface_rise) {
        return DIAGNOSIS_LEVEL_WARNING;
    }

    // 표면 온도 상승량이 충분하면 정상 (L_match = 0)
    return DIAGNOSIS_LEVEL_NORMAL;
}

// diagnosis_calculate_l_grad:
// 온도 구배의 안정성을 평가하는 함수
static diagnosis_level_t diagnosis_calculate_l_grad(const diagnosis_config_t *config,
                                                     const preprocess_result_t *result)
{
    // 온도 구배를 계산할 수 없으면 정상으로 판정 (L_grad = 0)
    if (!result->feature.temp_gradient_ok) {
        return DIAGNOSIS_LEVEL_NORMAL;
    }

    float gradient = result->feature.temp_gradient_c;

    // 온도 구배가 정상 임계값 이상이면 정상 (L_grad = 0)
    if (gradient >= config->air_gradient_normal_threshold_c) {
        return DIAGNOSIS_LEVEL_NORMAL;
    }

    // 온도 구배가 위험 임계값 이상이면 경고 (L_grad = 1)
    if (gradient >= config->air_gradient_critical_threshold_c) {
        return DIAGNOSIS_LEVEL_WARNING;
    }

    // 온도 구배가 위험 임계값 미만이면 위험 (L_grad = 2)
    return DIAGNOSIS_LEVEL_CRITICAL;
}

// diagnosis_calculate_l_safety:
// 표면 온도의 안전성을 평가하는 함수
static diagnosis_level_t diagnosis_calculate_l_safety(const diagnosis_config_t *config,
                                                       const preprocess_result_t *result)
{
    // 표면 온도를 읽을 수 없으면 정상으로 판정 (L_safety = 0)
    if (!result->cleaned.hot_surface_ok) {
        return DIAGNOSIS_LEVEL_NORMAL;
    }

    float surface_temp = result->cleaned.hot_surface_temp_c;

    // 온열 구역 표면 온도가 경고 임계값 미만이면 정상 (L_safety = 0)
    if (surface_temp < config->hot_surface_temp_warn_c) {
        return DIAGNOSIS_LEVEL_NORMAL;
    }

    // 온열 구역 표면 온도가 위험 임계값 이상이면 위험 (L_safety = 2)
    if (surface_temp >= config->hot_surface_temp_crit_c) {
        return DIAGNOSIS_LEVEL_CRITICAL;
    }

    // 온열 구역 표면 온도가 경고~위험 사이이면 경고 (L_safety = 1)
    return DIAGNOSIS_LEVEL_WARNING;
}

// diagnosis_calculate_l_fault:
// 센서 또는 장치의 이상 여부를 판단하는 함수
static diagnosis_level_t diagnosis_calculate_l_fault(const preprocess_result_t *result,
                                                      diagnosis_cause_flags_t *out_flags,
                                                      const char **out_reason)
{
    diagnosis_cause_flags_t flags = DIAGNOSIS_CAUSE_NONE;
    const char *reason = NULL;

    if (result->has_sensor_response_failure) {
        flags |= DIAGNOSIS_CAUSE_SENSOR_RESPONSE_FAILURE;
    }

    if (result->has_missing_value) {
        flags |= DIAGNOSIS_CAUSE_MISSING_VALUE;
    }

    if (result->has_out_of_range_value) {
        flags |= DIAGNOSIS_CAUSE_OUT_OF_RANGE_VALUE;
    }

    if (result->has_persistent_out_of_range_value) {
        flags |= DIAGNOSIS_CAUSE_PERSISTENT_OUT_OF_RANGE_VALUE;
    }

    if (result->has_repeated_value) {
        flags |= DIAGNOSIS_CAUSE_REPEATED_VALUE;
    }

    if (flags != DIAGNOSIS_CAUSE_NONE) {
        flags |= DIAGNOSIS_CAUSE_SENSOR_FAULT;
    }

    if ((flags & DIAGNOSIS_CAUSE_SENSOR_RESPONSE_FAILURE) != 0U) {
        reason = "sensor response failure";
    } else if ((flags & DIAGNOSIS_CAUSE_PERSISTENT_OUT_OF_RANGE_VALUE) != 0U) {
        reason = "persistent out of range value";
    } else if ((flags & DIAGNOSIS_CAUSE_OUT_OF_RANGE_VALUE) != 0U) {
        reason = "out of range value";
    } else if ((flags & DIAGNOSIS_CAUSE_MISSING_VALUE) != 0U) {
        reason = "missing sensor value";
    } else if ((flags & DIAGNOSIS_CAUSE_REPEATED_VALUE) != 0U) {
        reason = "repeated sensor value";
    }

    if (out_flags != NULL) {
        *out_flags = flags;
    }

    if (out_reason != NULL) {
        *out_reason = reason;
    }

    return flags == DIAGNOSIS_CAUSE_NONE ? DIAGNOSIS_LEVEL_NORMAL : DIAGNOSIS_LEVEL_CRITICAL;
}

// diagnosis_calculate_l_final:
// 최종 진단 레벨을 계산하는 함수
static diagnosis_level_t diagnosis_calculate_l_final(diagnosis_level_t l_match,
                                                      diagnosis_level_t l_grad,
                                                      diagnosis_level_t l_safety)
{
    // 최종 진단 = max(L_match, L_grad, L_safety)
    diagnosis_level_t max_level = l_match;

    if (l_grad > max_level) {
        max_level = l_grad;
    }

    if (l_safety > max_level) {
        max_level = l_safety;
    }

    return max_level;
}

static diagnosis_status_t diagnosis_status_from_level(diagnosis_level_t level)
{
    switch (level) {
        case DIAGNOSIS_LEVEL_NORMAL:
            return DIAGNOSIS_STATUS_NORMAL;
        case DIAGNOSIS_LEVEL_WARNING:
            return DIAGNOSIS_STATUS_WARNING;
        case DIAGNOSIS_LEVEL_CRITICAL:
            return DIAGNOSIS_STATUS_CRITICAL;
        default:
            return DIAGNOSIS_STATUS_DEVICE_FAULT;
    }
}

// 공개 API 구현
void diagnosis_get_default_config(diagnosis_config_t *out_config)
{
    if (out_config == NULL) {
        return;
    }

    out_config->heat_response_warning_time_ms = DIAGNOSIS_DEFAULT_HEAT_RESPONSE_WARNING_TIME_MS;
    out_config->heat_response_critical_time_ms = DIAGNOSIS_DEFAULT_HEAT_RESPONSE_CRITICAL_TIME_MS;
    out_config->heat_response_threshold_c = DIAGNOSIS_DEFAULT_HEAT_RESPONSE_THRESHOLD_C;
    out_config->basking_surface_target_min_c = DIAGNOSIS_DEFAULT_BASKING_SURFACE_TARGET_MIN_C;
    out_config->air_gradient_normal_threshold_c = DIAGNOSIS_DEFAULT_AIR_GRADIENT_NORMAL_THRESHOLD_C;
    out_config->air_gradient_critical_threshold_c = DIAGNOSIS_DEFAULT_AIR_GRADIENT_CRITICAL_THRESHOLD_C;
    out_config->hot_surface_temp_warn_c = DIAGNOSIS_DEFAULT_HOT_SURFACE_TEMP_WARN_C;
    out_config->hot_surface_temp_crit_c = DIAGNOSIS_DEFAULT_HOT_SURFACE_TEMP_CRIT_C;
}

esp_err_t diagnosis_init(diagnosis_ctx_t *ctx, const diagnosis_config_t *config)
{
    diagnosis_config_t effective_config;

    if (ctx == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    if (config == NULL) {
        diagnosis_get_default_config(&effective_config);
    } else {
        effective_config = *config;
    }

    if (!diagnosis_is_valid_config(&effective_config)) {
        return ESP_ERR_INVALID_ARG;
    }

    memset(ctx, 0, sizeof(*ctx));
    ctx->config = effective_config;

    return ESP_OK;
}

esp_err_t diagnosis_update(const diagnosis_ctx_t *ctx,
                          const preprocess_result_t *preprocess_result,
                          diagnosis_result_t *out_result)
{
    if (ctx == NULL || preprocess_result == NULL || out_result == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    if (!diagnosis_is_valid_config(&ctx->config)) {
        return ESP_ERR_INVALID_STATE;
    }

    memset(out_result, 0, sizeof(*out_result));

    // 장치 이상 여부를 먼저 확인
    out_result->l_fault =
        diagnosis_calculate_l_fault(preprocess_result, &out_result->cause_flags,
                                    &out_result->fault_reason);

    // 센서 이상이 없을 때만 다른 진단 지표 계산
    if (out_result->l_fault == DIAGNOSIS_LEVEL_NORMAL) {
        out_result->l_match = diagnosis_calculate_l_match(&ctx->config, preprocess_result);
        out_result->l_grad = diagnosis_calculate_l_grad(&ctx->config, preprocess_result);
        out_result->l_safety = diagnosis_calculate_l_safety(&ctx->config, preprocess_result);

        if (out_result->l_match != DIAGNOSIS_LEVEL_NORMAL) {
            out_result->cause_flags |= DIAGNOSIS_CAUSE_L_MATCH;
        }
        if (out_result->l_grad != DIAGNOSIS_LEVEL_NORMAL) {
            out_result->cause_flags |= DIAGNOSIS_CAUSE_L_GRAD;
        }
        if (out_result->l_safety != DIAGNOSIS_LEVEL_NORMAL) {
            out_result->cause_flags |= DIAGNOSIS_CAUSE_L_SAFETY;
        }

        out_result->l_final =
            diagnosis_calculate_l_final(out_result->l_match, out_result->l_grad, out_result->l_safety);
        out_result->final_status = diagnosis_status_from_level(out_result->l_final);
    } else {
        // 센서 이상이 있으면 최종 진단을 device_fault로 설정
        out_result->l_match = DIAGNOSIS_LEVEL_NORMAL;
        out_result->l_grad = DIAGNOSIS_LEVEL_NORMAL;
        out_result->l_safety = DIAGNOSIS_LEVEL_NORMAL;
        out_result->l_final = DIAGNOSIS_LEVEL_CRITICAL;
        out_result->final_status = DIAGNOSIS_STATUS_DEVICE_FAULT;
    }

    return ESP_OK;
}

const char *diagnosis_get_status_name(diagnosis_status_t status)
{
    switch (status) {
        case DIAGNOSIS_STATUS_NORMAL:
            return "normal";
        case DIAGNOSIS_STATUS_WARNING:
            return "warning";
        case DIAGNOSIS_STATUS_CRITICAL:
            return "critical";
        case DIAGNOSIS_STATUS_DEVICE_FAULT:
            return "device_fault";
        default:
            return "unknown";
    }
}
