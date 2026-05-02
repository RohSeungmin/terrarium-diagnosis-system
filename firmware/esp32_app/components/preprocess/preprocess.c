/*
 * preprocess.c
 *
 * 역할:
 * - 결측값, 센서 응답 실패, 비정상 범위, 동일값 반복, 온도구배 계산 로직을 담당함
 * - 센서/데이터 이상 플래그를 세우고 diagnosis 단계에서 Device Fault 후보로 판단할 수 있게 함
 *
 */

#include "preprocess.h"

#include <math.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

// preprocess_is_valid_config:
// 전처리 설정값이 사용할 수 있는 범위인지 확인하는 함수
static bool preprocess_is_valid_config(const preprocess_config_t *config)
{
    if (config == NULL) {
        return false;
    }

    return config->repeated_value_threshold > 0U &&
           isfinite(config->repeated_float_epsilon_c) &&
           config->repeated_float_epsilon_c >= 0.0f &&
           isfinite(config->min_temp_c) &&
           isfinite(config->max_temp_c) &&
           config->min_temp_c <= config->max_temp_c &&
           config->min_light_level <= config->max_light_level &&
           config->heat_source_off_light_level <= config->heat_source_on_light_level &&
           config->out_of_range_value_threshold > 0U;
}

// preprocess_is_valid_temperature:
// 온도값이 유한한 숫자이고 설정된 센서 유효 범위 안에 있는지 확인하는 함수
static bool preprocess_is_valid_temperature(float temp_c, const preprocess_config_t *config)
{
    return isfinite(temp_c) && temp_c >= config->min_temp_c && temp_c <= config->max_temp_c;
}

// preprocess_is_valid_light_level:
// 조도값이 설정된 센서 유효 범위 안에 있는지 확인하는 함수
static bool preprocess_is_valid_light_level(int light_level, const preprocess_config_t *config)
{
    return light_level >= config->min_light_level && light_level <= config->max_light_level;
}

// preprocess_float_equal:
// DS18B20 해상도를 고려한 허용 오차 안에서 같은 값으로 볼 수 있는지 비교하는 함수
static bool preprocess_float_equal(float left, float right, float epsilon_c)
{
    return fabsf(left - right) <= epsilon_c;
}

// preprocess_increment_repeat_count:
// 동일값 반복 횟수를 증가시키되 uint32_t 범위를 넘지 않도록 제한하는 함수
static uint32_t preprocess_increment_repeat_count(uint32_t previous_count)
{
    if (previous_count == 0U) {
        return 2U;
    }

    if (previous_count == UINT32_MAX) {
        return UINT32_MAX;
    }

    return previous_count + 1U;
}

// preprocess_increment_saturating_count:
// 카운트를 증가시키되 uint32_t 범위를 넘지 않도록 제한하는 함수
static uint32_t preprocess_increment_saturating_count(uint32_t previous_count)
{
    if (previous_count == UINT32_MAX) {
        return UINT32_MAX;
    }

    return previous_count + 1U;
}

// preprocess_invalidate_temperature:
// 사용할 수 없는 온도값을 초기화하고 해당 OK 플래그를 false로 바꾸는 함수
static void preprocess_invalidate_temperature(float *value, bool *ok)
{
    if (value != NULL) {
        *value = 0.0f;
    }
    if (ok != NULL) {
        *ok = false;
    }
}

// preprocess_invalidate_light_level:
// 사용할 수 없는 조도값을 초기화하고 해당 OK 플래그를 false로 바꾸는 함수
static void preprocess_invalidate_light_level(int *value, bool *ok)
{
    if (value != NULL) {
        *value = 0;
    }
    if (ok != NULL) {
        *ok = false;
    }
}

// preprocess_has_missing_value:
// 필요한 센서값 중 하나라도 유효하지 않은 상태인지 확인하는 함수
static bool preprocess_has_missing_value(const sensor_data_t *data)
{
    return !data->hot_surface_ok || !data->hot_air_ok || !data->cool_air_ok || !data->light_ok;
}

// preprocess_update_out_of_range_count:
// 비정상 범위 값이 연속으로 관측되는 횟수를 갱신하는 함수
static void preprocess_update_out_of_range_count(uint32_t *count, bool is_out_of_range)
{
    if (count == NULL) {
        return;
    }

    if (is_out_of_range) {
        *count = preprocess_increment_saturating_count(*count);
    } else {
        *count = 0U;
    }
}

// preprocess_apply_range_checks:
// cleaned 센서값이 설정된 유효 범위를 벗어나면 해당 값을 진단 입력에서 제외하는 함수
static void preprocess_apply_range_checks(preprocess_ctx_t *ctx, preprocess_result_t *result)
{
    sensor_data_t *cleaned = &result->cleaned;
    const preprocess_config_t *config = &ctx->config;
    const uint32_t threshold = config->out_of_range_value_threshold;
    bool persistent_out_of_range = false;

    bool hot_surface_out_of_range =
        cleaned->hot_surface_ok &&
        !preprocess_is_valid_temperature(cleaned->hot_surface_temp_c, config);
    bool hot_air_out_of_range =
        cleaned->hot_air_ok &&
        !preprocess_is_valid_temperature(cleaned->hot_air_temp_c, config);
    bool cool_air_out_of_range =
        cleaned->cool_air_ok &&
        !preprocess_is_valid_temperature(cleaned->cool_air_temp_c, config);
    bool light_out_of_range =
        cleaned->light_ok &&
        !preprocess_is_valid_light_level(cleaned->light_level, config);

    preprocess_update_out_of_range_count(&ctx->hot_surface_out_of_range_count,
                                         hot_surface_out_of_range);
    preprocess_update_out_of_range_count(&ctx->hot_air_out_of_range_count,
                                         hot_air_out_of_range);
    preprocess_update_out_of_range_count(&ctx->cool_air_out_of_range_count,
                                         cool_air_out_of_range);
    preprocess_update_out_of_range_count(&ctx->light_out_of_range_count,
                                         light_out_of_range);

    persistent_out_of_range =
        ctx->hot_surface_out_of_range_count >= threshold ||
        ctx->hot_air_out_of_range_count >= threshold ||
        ctx->cool_air_out_of_range_count >= threshold ||
        ctx->light_out_of_range_count >= threshold;

    if (hot_surface_out_of_range) {
        preprocess_invalidate_temperature(&cleaned->hot_surface_temp_c, &cleaned->hot_surface_ok);
        result->has_out_of_range_value = true;
    }

    if (hot_air_out_of_range) {
        preprocess_invalidate_temperature(&cleaned->hot_air_temp_c, &cleaned->hot_air_ok);
        result->has_out_of_range_value = true;
    }

    if (cool_air_out_of_range) {
        preprocess_invalidate_temperature(&cleaned->cool_air_temp_c, &cleaned->cool_air_ok);
        result->has_out_of_range_value = true;
    }

    if (light_out_of_range) {
        preprocess_invalidate_light_level(&cleaned->light_level, &cleaned->light_ok);
        result->has_out_of_range_value = true;
    }

    result->has_persistent_out_of_range_value = persistent_out_of_range;
}

// preprocess_next_float_repeat_count:
// 현재 float 센서값이 이전값과 같으면 반복 횟수를 갱신하고, 아니면 새 관측으로 시작하는 함수
static uint32_t preprocess_next_float_repeat_count(bool has_previous,
                                                   bool previous_ok,
                                                   float previous_value,
                                                   bool current_ok,
                                                   float current_value,
                                                   uint32_t previous_count,
                                                   float epsilon_c)
{
    if (!current_ok) {
        return 0U;
    }

    if (has_previous && previous_ok &&
        preprocess_float_equal(previous_value, current_value, epsilon_c)) {
        return preprocess_increment_repeat_count(previous_count);
    }

    return 1U;
}

// preprocess_next_int_repeat_count:
// 현재 정수 센서값이 이전값과 같으면 반복 횟수를 갱신하고, 아니면 새 관측으로 시작하는 함수
static uint32_t preprocess_next_int_repeat_count(bool has_previous,
                                                 bool previous_ok,
                                                 int previous_value,
                                                 bool current_ok,
                                                 int current_value,
                                                 uint32_t previous_count)
{
    if (!current_ok) {
        return 0U;
    }

    if (has_previous && previous_ok && previous_value == current_value) {
        return preprocess_increment_repeat_count(previous_count);
    }

    return 1U;
}

// preprocess_repeat_count_reached:
// 동일값 반복 횟수가 설정된 기준에 도달했는지 확인하는 함수
static bool preprocess_repeat_count_reached(uint32_t repeat_count, uint32_t threshold)
{
    return repeat_count >= threshold;
}

// preprocess_update_repeat_state:
// 각 센서별 동일값 반복 횟수를 갱신하고 반복 이상 여부를 결과에 기록하는 함수
static void preprocess_update_repeat_state(preprocess_ctx_t *ctx, preprocess_result_t *result)
{
    const sensor_data_t *current = &result->cleaned;
    const sensor_data_t *previous = &ctx->previous;
    const uint32_t threshold = ctx->config.repeated_value_threshold;
    const float epsilon_c = ctx->config.repeated_float_epsilon_c;

    ctx->hot_surface_repeat_count =
        preprocess_next_float_repeat_count(ctx->has_previous,
                                           previous->hot_surface_ok,
                                           previous->hot_surface_temp_c,
                                           current->hot_surface_ok,
                                           current->hot_surface_temp_c,
                                           ctx->hot_surface_repeat_count,
                                           epsilon_c);

    ctx->hot_air_repeat_count =
        preprocess_next_float_repeat_count(ctx->has_previous,
                                           previous->hot_air_ok,
                                           previous->hot_air_temp_c,
                                           current->hot_air_ok,
                                           current->hot_air_temp_c,
                                           ctx->hot_air_repeat_count,
                                           epsilon_c);

    ctx->cool_air_repeat_count =
        preprocess_next_float_repeat_count(ctx->has_previous,
                                           previous->cool_air_ok,
                                           previous->cool_air_temp_c,
                                           current->cool_air_ok,
                                           current->cool_air_temp_c,
                                           ctx->cool_air_repeat_count,
                                           epsilon_c);

    ctx->light_repeat_count =
        preprocess_next_int_repeat_count(ctx->has_previous,
                                         previous->light_ok,
                                         previous->light_level,
                                         current->light_ok,
                                         current->light_level,
                                         ctx->light_repeat_count);

    result->has_repeated_value =
        preprocess_repeat_count_reached(ctx->hot_surface_repeat_count, threshold) ||
        preprocess_repeat_count_reached(ctx->hot_air_repeat_count, threshold) ||
        preprocess_repeat_count_reached(ctx->cool_air_repeat_count, threshold) ||
        preprocess_repeat_count_reached(ctx->light_repeat_count, threshold);
}

// preprocess_calculate_temperature_gradient:
// 온열 구역 공기 온도와 냉각 구역 공기 온도의 차이를 계산하는 함수
static void preprocess_calculate_temperature_gradient(preprocess_result_t *result)
{
    const sensor_data_t *cleaned = &result->cleaned;

    if (!cleaned->hot_air_ok || !cleaned->cool_air_ok) {
        return;
    }

    result->temp_gradient_ok = true;
    result->temp_gradient_c = cleaned->hot_air_temp_c - cleaned->cool_air_temp_c;
}

// preprocess_calculate_surface_step_delta:
// 현재 표면 온도와 직전 표면 온도의 차이를 계산하는 함수
static void preprocess_calculate_surface_step_delta(const preprocess_ctx_t *ctx,
                                                    preprocess_result_t *result)
{
    const sensor_data_t *cleaned = &result->cleaned;

    if (!ctx->has_previous || !ctx->previous.hot_surface_ok || !cleaned->hot_surface_ok) {
        return;
    }

    result->surface_temp_step_delta_ok = true;
    result->surface_temp_step_delta_c =
        cleaned->hot_surface_temp_c - ctx->previous.hot_surface_temp_c;
}

// preprocess_reset_heat_source_state:
// 조도값으로 열원 상태를 판단할 수 없을 때 열원 관련 상태를 초기화하는 함수
static void preprocess_reset_heat_source_state(preprocess_ctx_t *ctx)
{
    ctx->has_previous_heat_source_state = false;
    ctx->previous_heat_source_on = false;
    ctx->heat_source_on_since_ms = 0U;
    ctx->has_heat_source_on_surface_temp_baseline = false;
    ctx->heat_source_on_surface_temp_c = 0.0f;
}

// preprocess_update_heat_source_state:
// 조도값을 기준으로 열원 ON/OFF 상태, ON 시작 시각, 표면 온도 상승량을 갱신하는 함수
static void preprocess_update_heat_source_state(preprocess_ctx_t *ctx,
                                                uint32_t now_ms,
                                                preprocess_result_t *result)
{
    const sensor_data_t *cleaned = &result->cleaned;

    if (!cleaned->light_ok) {
        preprocess_reset_heat_source_state(ctx);
        return;
    }

    bool heat_source_on = false;
    if (ctx->has_previous_heat_source_state && ctx->previous_heat_source_on) {
        heat_source_on = cleaned->light_level >= ctx->config.heat_source_off_light_level;
    } else {
        heat_source_on = cleaned->light_level >= ctx->config.heat_source_on_light_level;
    }

    const bool heat_source_turned_on =
        heat_source_on &&
        (!ctx->has_previous_heat_source_state || !ctx->previous_heat_source_on);

    result->heat_source_state_ok = true;
    result->heat_source_on = heat_source_on;

    if (heat_source_turned_on) {
        ctx->heat_source_on_since_ms = now_ms;
        ctx->has_heat_source_on_surface_temp_baseline = cleaned->hot_surface_ok;
        ctx->heat_source_on_surface_temp_c =
            cleaned->hot_surface_ok ? cleaned->hot_surface_temp_c : 0.0f;
    } else if (heat_source_on &&
               !ctx->has_heat_source_on_surface_temp_baseline &&
               cleaned->hot_surface_ok) {
        ctx->has_heat_source_on_surface_temp_baseline = true;
        ctx->heat_source_on_surface_temp_c = cleaned->hot_surface_temp_c;
    } else if (!heat_source_on) {
        ctx->heat_source_on_since_ms = 0U;
        ctx->has_heat_source_on_surface_temp_baseline = false;
        ctx->heat_source_on_surface_temp_c = 0.0f;
    }

    if (heat_source_on) {
        result->heat_source_on_since_ms = ctx->heat_source_on_since_ms;
        result->heat_source_on_duration_ms = now_ms - ctx->heat_source_on_since_ms;

        if (ctx->has_heat_source_on_surface_temp_baseline && cleaned->hot_surface_ok) {
            result->surface_temp_rise_since_heat_on_ok = true;
            result->surface_temp_rise_since_heat_on_c =
                cleaned->hot_surface_temp_c - ctx->heat_source_on_surface_temp_c;
        }
    }

    ctx->has_previous_heat_source_state = true;
    ctx->previous_heat_source_on = heat_source_on;
}

static void preprocess_store_summary_sample(preprocess_summary_sample_t samples[],
                                            uint32_t index,
                                            bool value_ok,
                                            float value)
{
    if (samples == NULL || index >= PREPROCESS_SUMMARY_WINDOW_SAMPLE_COUNT) {
        return;
    }

    samples[index].ok = value_ok && isfinite(value);
    samples[index].value = samples[index].ok ? value : 0.0f;
}

// preprocess_build_summary_value:
// 최근 summary window 안의 유효 샘플만 사용해 평균/최솟값/최댓값을 계산하는 함수
static preprocess_summary_value_t preprocess_build_summary_value(
    const preprocess_summary_sample_t samples[],
    uint32_t sample_count)
{
    preprocess_summary_value_t summary = {0};

    if (samples == NULL) {
        return summary;
    }

    for (uint32_t i = 0; i < sample_count && i < PREPROCESS_SUMMARY_WINDOW_SAMPLE_COUNT; i++) {
        if (!samples[i].ok) {
            continue;
        }

        if (summary.sample_count == 0U) {
            summary.ok = true;
            summary.sample_count = 1U;
            summary.average = samples[i].value;
            summary.min = samples[i].value;
            summary.max = samples[i].value;
            continue;
        }

        if (samples[i].value < summary.min) {
            summary.min = samples[i].value;
        }

        if (samples[i].value > summary.max) {
            summary.max = samples[i].value;
        }

        uint32_t next_count = summary.sample_count + 1U;
        summary.average += (samples[i].value - summary.average) / (float)next_count;
        summary.sample_count = next_count;
    }

    return summary;
}

// preprocess_update_summary:
// 정제된 센서값과 feature를 바탕으로 최근 6샘플 평시 전송용 요약값을 갱신하는 함수
static void preprocess_update_summary(preprocess_ctx_t *ctx, preprocess_result_t *result)
{
    const sensor_data_t *cleaned = &result->cleaned;
    const uint32_t index = ctx->summary_window_index;

    preprocess_store_summary_sample(ctx->hot_surface_summary_samples, index,
                                    cleaned->hot_surface_ok, cleaned->hot_surface_temp_c);
    preprocess_store_summary_sample(ctx->hot_air_summary_samples, index,
                                    cleaned->hot_air_ok, cleaned->hot_air_temp_c);
    preprocess_store_summary_sample(ctx->cool_air_summary_samples, index,
                                    cleaned->cool_air_ok, cleaned->cool_air_temp_c);
    preprocess_store_summary_sample(ctx->light_summary_samples, index,
                                    cleaned->light_ok, (float)cleaned->light_level);
    preprocess_store_summary_sample(ctx->temp_gradient_summary_samples, index,
                                    result->temp_gradient_ok, result->temp_gradient_c);

    if (ctx->summary_window_sample_count < PREPROCESS_SUMMARY_WINDOW_SAMPLE_COUNT) {
        ctx->summary_window_sample_count++;
    }

    ctx->summary_window_index = (index + 1U) % PREPROCESS_SUMMARY_WINDOW_SAMPLE_COUNT;

    result->summary.ready =
        ctx->summary_window_sample_count >= PREPROCESS_SUMMARY_WINDOW_SAMPLE_COUNT;
    result->summary.window_sample_count = ctx->summary_window_sample_count;
    result->summary.window_capacity = PREPROCESS_SUMMARY_WINDOW_SAMPLE_COUNT;
    result->summary.hot_surface_temp_c =
        preprocess_build_summary_value(ctx->hot_surface_summary_samples,
                                       ctx->summary_window_sample_count);
    result->summary.hot_air_temp_c =
        preprocess_build_summary_value(ctx->hot_air_summary_samples,
                                       ctx->summary_window_sample_count);
    result->summary.cool_air_temp_c =
        preprocess_build_summary_value(ctx->cool_air_summary_samples,
                                       ctx->summary_window_sample_count);
    result->summary.light_level =
        preprocess_build_summary_value(ctx->light_summary_samples,
                                       ctx->summary_window_sample_count);
    result->summary.temp_gradient_c =
        preprocess_build_summary_value(ctx->temp_gradient_summary_samples,
                                       ctx->summary_window_sample_count);
}

// preprocess_build_feature:
// diagnosis 단계가 사용할 feature 묶음을 생성하는 함수
static void preprocess_build_feature(preprocess_result_t *result)
{
    result->feature.temp_gradient_ok = result->temp_gradient_ok;
    result->feature.temp_gradient_c = result->temp_gradient_c;
    result->feature.heat_source_state_ok = result->heat_source_state_ok;
    result->feature.heat_source_on = result->heat_source_on;
    result->feature.heat_source_on_since_ms = result->heat_source_on_since_ms;
    result->feature.heat_source_on_duration_ms = result->heat_source_on_duration_ms;
    result->feature.surface_temp_step_delta_ok = result->surface_temp_step_delta_ok;
    result->feature.surface_temp_step_delta_c = result->surface_temp_step_delta_c;
    result->feature.surface_temp_rise_since_heat_on_ok = result->surface_temp_rise_since_heat_on_ok;
    result->feature.surface_temp_rise_since_heat_on_c = result->surface_temp_rise_since_heat_on_c;
}

// preprocess_update_context_previous:
// 다음 전처리 주기에서 사용할 이전 센서값을 저장하는 함수
static void preprocess_update_context_previous(preprocess_ctx_t *ctx,
                                               const preprocess_result_t *result)
{
    ctx->previous = result->cleaned;
    ctx->has_previous = true;
}

// preprocess_get_default_config:
// 기본 전처리 설정값을 out_config에 저장하는 함수
void preprocess_get_default_config(preprocess_config_t *out_config)
{
    if (out_config == NULL) {
        return;
    }

    out_config->repeated_value_threshold = PREPROCESS_DEFAULT_REPEAT_THRESHOLD;
    out_config->repeated_float_epsilon_c = PREPROCESS_DEFAULT_REPEAT_EPSILON_C;
    out_config->min_temp_c = PREPROCESS_DEFAULT_SENSOR_TEMP_MIN_C;
    out_config->max_temp_c = PREPROCESS_DEFAULT_SENSOR_TEMP_MAX_C;
    out_config->min_light_level = PREPROCESS_DEFAULT_SENSOR_LIGHT_MIN_LEVEL;
    out_config->max_light_level = PREPROCESS_DEFAULT_SENSOR_LIGHT_MAX_LEVEL;
    out_config->heat_source_on_light_level = PREPROCESS_DEFAULT_HEAT_SOURCE_ON_LIGHT_LEVEL;
    out_config->heat_source_off_light_level = PREPROCESS_DEFAULT_HEAT_SOURCE_OFF_LIGHT_LEVEL;
    out_config->out_of_range_value_threshold = PREPROCESS_DEFAULT_OUT_OF_RANGE_THRESHOLD;
}

// preprocess_init:
// 전처리 상태를 초기화하고 사용할 설정값을 저장하는 함수
esp_err_t preprocess_init(preprocess_ctx_t *ctx, const preprocess_config_t *config)
{
    preprocess_config_t effective_config;

    if (ctx == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    if (config == NULL) {
        preprocess_get_default_config(&effective_config);
    } else {
        effective_config = *config;
    }

    if (!preprocess_is_valid_config(&effective_config)) {
        return ESP_ERR_INVALID_ARG;
    }

    memset(ctx, 0, sizeof(*ctx));
    ctx->config = effective_config;

    return ESP_OK;
}

esp_err_t preprocess_reset_summary(preprocess_ctx_t *ctx)
{
    if (ctx == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    memset(ctx->hot_surface_summary_samples, 0, sizeof(ctx->hot_surface_summary_samples));
    memset(ctx->hot_air_summary_samples, 0, sizeof(ctx->hot_air_summary_samples));
    memset(ctx->cool_air_summary_samples, 0, sizeof(ctx->cool_air_summary_samples));
    memset(ctx->light_summary_samples, 0, sizeof(ctx->light_summary_samples));
    memset(ctx->temp_gradient_summary_samples, 0, sizeof(ctx->temp_gradient_summary_samples));
    ctx->summary_window_index = 0U;
    ctx->summary_window_sample_count = 0U;

    return ESP_OK;
}

// preprocess_update:
// 원본 센서 데이터와 센서 읽기 결과를 받아 진단 단계에서 사용할 전처리 결과를 생성하는 함수
// 센서/데이터 이상이 하나라도 있으면 usable_for_diagnosis를 false로 설정함
esp_err_t preprocess_update(preprocess_ctx_t *ctx, const sensor_data_t *raw_data,
                            esp_err_t sensor_read_err, uint32_t now_ms,
                            preprocess_result_t *out_result)
{
    if (ctx == NULL || raw_data == NULL || out_result == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    if (!preprocess_is_valid_config(&ctx->config)) {
        return ESP_ERR_INVALID_STATE;
    }

    memset(out_result, 0, sizeof(*out_result));
    out_result->cleaned = *raw_data;
    out_result->has_sensor_response_failure = sensor_read_err != ESP_OK;
    out_result->has_missing_value = preprocess_has_missing_value(&out_result->cleaned);

    preprocess_apply_range_checks(ctx, out_result);
    out_result->has_missing_value =
        out_result->has_missing_value || preprocess_has_missing_value(&out_result->cleaned);

    preprocess_update_repeat_state(ctx, out_result);
    preprocess_calculate_temperature_gradient(out_result);
    preprocess_calculate_surface_step_delta(ctx, out_result);
    preprocess_update_heat_source_state(ctx, now_ms, out_result);
    preprocess_build_feature(out_result);
    preprocess_update_summary(ctx, out_result);

    out_result->usable_for_diagnosis =
        !out_result->has_sensor_response_failure &&
        !out_result->has_missing_value &&
        !out_result->has_out_of_range_value &&
        !out_result->has_persistent_out_of_range_value &&
        !out_result->has_repeated_value;

    preprocess_update_context_previous(ctx, out_result);

    return ESP_OK;
}
