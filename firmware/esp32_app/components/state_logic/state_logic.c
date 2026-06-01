/*
 * state_logic.c
 *
 * 역할:
 * - 진단 결과를 바탕으로 시스템 상태를 전이시키는 모듈
 * - normal, warning, critical, device fault 상태를 관리함
 * - 연속 관측 횟수 조건과 평시/진단 모드 전환 조건을 처리함
 *
 */

#include "state_logic.h"

#include <stddef.h>
#include <string.h>

// 기본 상태 전이 설정값
#define STATE_LOGIC_DEFAULT_WARNING_ENTRY_COUNT 2U      // normal → warning 진입 조건
#define STATE_LOGIC_DEFAULT_CRITICAL_ENTRY_COUNT 2U     // warning → critical 진입 조건
#define STATE_LOGIC_DEFAULT_NORMAL_ENTRY_COUNT 3U       // warning/critical → normal 복귀 조건
#define STATE_LOGIC_DEFAULT_NORMAL_SUMMARY_PUBLISH_INTERVAL_MS 180000U
#define STATE_LOGIC_DEFAULT_DEVICE_FAULT_RECOVERY_COUNT 3U

// state_logic_is_valid_config:
// 상태 전이 설정값이 사용할 수 있는 범위인지 확인하는 함수
static bool state_logic_is_valid_config(const state_logic_config_t *config)
{
    if (config == NULL) {
        return false;
    }

    return config->warning_entry_count > 0 &&
           config->critical_entry_count > 0 &&
           config->normal_entry_count > 0 &&
           config->normal_summary_publish_interval_ms > 0 &&
           config->device_fault_recovery_count > 0;
}

// state_logic_reset_consecutive_count:
// 연속 관측 횟수를 초기화하는 함수
static void state_logic_reset_consecutive_count(state_logic_ctx_t *ctx)
{
    ctx->consecutive_count = 0;
}

// state_logic_increment_consecutive_count:
// 같은 진단 결과가 계속 관측될 때 카운트를 증가시키되, uint8_t 범위를 넘지 않도록 제한
static void state_logic_increment_consecutive_count(state_logic_ctx_t *ctx)
{
    if (ctx->consecutive_count < UINT8_MAX) {
        ctx->consecutive_count++;
    }
}

static void state_logic_increment_device_fault_recovery_count(state_logic_ctx_t *ctx)
{
    if (ctx->device_fault_recovery_count < UINT8_MAX) {
        ctx->device_fault_recovery_count++;
    }
}

static bool state_logic_is_hot_surface_critical(const diagnosis_result_t *diagnosis_result)
{
    return diagnosis_result->l_safety == DIAGNOSIS_LEVEL_CRITICAL &&
           (diagnosis_result->cause_flags & DIAGNOSIS_CAUSE_L_SAFETY) != 0U;
}

static void state_logic_enter_normal(state_logic_ctx_t *ctx, uint32_t now_ms)
{
    ctx->current_state = STATE_NORMAL;
    ctx->state_entry_time_ms = now_ms;
    ctx->last_summary_publish_time_ms = now_ms;
    ctx->device_fault_recovery_count = 0U;
    state_logic_reset_consecutive_count(ctx);
}

static void state_logic_enter_warning(state_logic_ctx_t *ctx, uint32_t now_ms)
{
    ctx->current_state = STATE_WARNING;
    ctx->state_entry_time_ms = now_ms;
    ctx->device_fault_recovery_count = 0U;
    state_logic_reset_consecutive_count(ctx);
}

static void state_logic_enter_critical(state_logic_ctx_t *ctx, uint32_t now_ms)
{
    ctx->current_state = STATE_CRITICAL;
    ctx->state_entry_time_ms = now_ms;
    ctx->device_fault_recovery_count = 0U;
    state_logic_reset_consecutive_count(ctx);
}

static void state_logic_prepare_normal_periodic_output(state_logic_ctx_t *ctx,
                                                       uint32_t now_ms,
                                                       state_logic_result_t *out_result)
{
    const uint32_t elapsed_ms = now_ms - ctx->last_summary_publish_time_ms;

    out_result->current_state = STATE_NORMAL;
    out_result->state_changed = false;

    if (elapsed_ms >= ctx->config.normal_summary_publish_interval_ms) {
        ctx->last_summary_publish_time_ms = now_ms;
        out_result->message_type = MESSAGE_SUMMARY;
        out_result->should_send_message = true;
    } else {
        out_result->message_type = MESSAGE_HEARTBEAT;
        out_result->should_send_message = false;
    }
}

// state_logic_handle_device_fault:
// 장치 이상 상태로 즉시 전이하고 메시지를 발송
static void state_logic_handle_device_fault(state_logic_ctx_t *ctx,
                                            uint32_t now_ms,
                                            const diagnosis_result_t *diagnosis_result,
                                            state_logic_result_t *out_result)
{
    (void)diagnosis_result;

    bool state_changed = (ctx->current_state != STATE_DEVICE_FAULT);

    if (state_changed) {
        ctx->current_state = STATE_DEVICE_FAULT;
        ctx->state_entry_time_ms = now_ms;
        ctx->device_fault_recovery_count = 0U;
        state_logic_reset_consecutive_count(ctx);
    }

    out_result->current_state = STATE_DEVICE_FAULT;
    out_result->message_type = MESSAGE_FAULT;
    out_result->state_changed = state_changed;
    out_result->should_send_message = true;
}

// state_logic_handle_normal_state:
// normal 상태에서의 상태 전이 로직
static void state_logic_handle_normal_state(state_logic_ctx_t *ctx,
                                            uint32_t now_ms,
                                            const diagnosis_result_t *diagnosis_result,
                                            state_logic_result_t *out_result)
{
    // 현재 진단 결과가 normal(0)이면 연속 관측 카운트 유지
    if (diagnosis_result->l_final == DIAGNOSIS_LEVEL_NORMAL) {
        state_logic_increment_consecutive_count(ctx);
        state_logic_prepare_normal_periodic_output(ctx, now_ms, out_result);
    }
    // warning 이상이 관측되면 같은 진단 결과의 연속 횟수를 누적
    else {
        if (state_logic_is_hot_surface_critical(diagnosis_result)) {
            state_logic_enter_critical(ctx, now_ms);

            out_result->current_state = STATE_CRITICAL;
            out_result->message_type = MESSAGE_ALERT;
            out_result->state_changed = true;
            out_result->should_send_message = true;
            ctx->last_diagnosis_level = diagnosis_result->l_final;
            return;
        }

        if (ctx->last_diagnosis_level != diagnosis_result->l_final) {
            state_logic_reset_consecutive_count(ctx);
        }
        state_logic_increment_consecutive_count(ctx);

        const bool critical_observed = diagnosis_result->l_final == DIAGNOSIS_LEVEL_CRITICAL;
        const uint8_t entry_count =
            critical_observed ? ctx->config.critical_entry_count : ctx->config.warning_entry_count;

        // warning/critical 진입 조건 충족 여부 확인
        if (ctx->consecutive_count >= entry_count) {
            if (critical_observed) {
                state_logic_enter_critical(ctx, now_ms);
                out_result->current_state = STATE_CRITICAL;
                out_result->message_type = MESSAGE_ALERT;
            } else {
                state_logic_enter_warning(ctx, now_ms);
                out_result->current_state = STATE_WARNING;
                out_result->message_type = MESSAGE_EVENT;
            }
            out_result->state_changed = true;
            out_result->should_send_message = true;
        } else {
            // 아직 warning 진입 조건 미충족, normal 상태 유지
            out_result->current_state = STATE_NORMAL;
            out_result->message_type = MESSAGE_HEARTBEAT;
            out_result->state_changed = false;
            out_result->should_send_message = false;
        }
    }

    ctx->last_diagnosis_level = diagnosis_result->l_final;
}

// state_logic_handle_warning_state:
// warning 상태에서의 상태 전이 로직
static void state_logic_handle_warning_state(state_logic_ctx_t *ctx,
                                             uint32_t now_ms,
                                             const diagnosis_result_t *diagnosis_result,
                                             state_logic_result_t *out_result)
{
    // critical(2) 진단이 관측되는지 확인
    if (diagnosis_result->l_final == DIAGNOSIS_LEVEL_CRITICAL) {
        bool immediate_critical = state_logic_is_hot_surface_critical(diagnosis_result);

        // critical 이상이 관측되면 카운트 누적
        if (ctx->last_diagnosis_level == DIAGNOSIS_LEVEL_CRITICAL) {
            state_logic_increment_consecutive_count(ctx);
        } else {
            state_logic_reset_consecutive_count(ctx);
            state_logic_increment_consecutive_count(ctx);
        }

        // critical 진입 조건 충족 여부 확인
        if (immediate_critical || ctx->consecutive_count >= ctx->config.critical_entry_count) {
            state_logic_enter_critical(ctx, now_ms);

            out_result->current_state = STATE_CRITICAL;
            out_result->message_type = MESSAGE_ALERT;  // 위험 알림
            out_result->state_changed = true;
            out_result->should_send_message = true;
        } else {
            // 아직 critical 진입 조건 미충족, warning 상태 유지
            out_result->current_state = STATE_WARNING;
            out_result->message_type = MESSAGE_EVENT;
            out_result->state_changed = false;
            out_result->should_send_message = true;
        }
    }
    // normal(0) 진단이 관측되는지 확인
    else if (diagnosis_result->l_final == DIAGNOSIS_LEVEL_NORMAL) {
        // normal이 관측되면 카운트 누적
        if (ctx->last_diagnosis_level == DIAGNOSIS_LEVEL_NORMAL) {
            state_logic_increment_consecutive_count(ctx);
        } else {
            state_logic_reset_consecutive_count(ctx);
            state_logic_increment_consecutive_count(ctx);
        }

        // normal 복귀 조건 충족 여부 확인
        if (ctx->consecutive_count >= ctx->config.normal_entry_count) {
            state_logic_enter_normal(ctx, now_ms);

            out_result->current_state = STATE_NORMAL;
            out_result->message_type = MESSAGE_EVENT;  // 정상 복귀 이벤트
            out_result->state_changed = true;
            out_result->should_send_message = true;
        } else {
            // 아직 normal 복귀 조건 미충족, warning 상태 유지
            out_result->current_state = STATE_WARNING;
            out_result->message_type = MESSAGE_EVENT;
            out_result->state_changed = false;
            out_result->should_send_message = true;
        }
    }
    // warning(1) 진단이 계속 관측되는 경우
    else {
        state_logic_increment_consecutive_count(ctx);

        out_result->current_state = STATE_WARNING;
        out_result->message_type = MESSAGE_EVENT;
        out_result->state_changed = false;
        out_result->should_send_message = true;
    }

    ctx->last_diagnosis_level = diagnosis_result->l_final;
}

// state_logic_handle_critical_state:
// critical 상태에서의 상태 전이 로직
static void state_logic_handle_critical_state(state_logic_ctx_t *ctx,
                                              uint32_t now_ms,
                                              const diagnosis_result_t *diagnosis_result,
                                              state_logic_result_t *out_result)
{
    // normal(0) 진단이 관측되는지 확인
    if (diagnosis_result->l_final == DIAGNOSIS_LEVEL_NORMAL) {
        // normal이 관측되면 카운트 누적
        if (ctx->last_diagnosis_level == DIAGNOSIS_LEVEL_NORMAL) {
            state_logic_increment_consecutive_count(ctx);
        } else {
            state_logic_reset_consecutive_count(ctx);
            state_logic_increment_consecutive_count(ctx);
        }

        // normal 복귀 조건 충족 여부 확인
        if (ctx->consecutive_count >= ctx->config.normal_entry_count) {
            state_logic_enter_normal(ctx, now_ms);

            out_result->current_state = STATE_NORMAL;
            out_result->message_type = MESSAGE_ALERT;  // 위험 해제 알림
            out_result->state_changed = true;
            out_result->should_send_message = true;
        } else {
            // 아직 normal 복귀 조건 미충족, critical 상태 유지
            out_result->current_state = STATE_CRITICAL;
            out_result->message_type = MESSAGE_ALERT;
            out_result->state_changed = false;
            out_result->should_send_message = true;
        }
    }
    // warning(1) 이상이 계속 관측되는 경우
    else {
        state_logic_reset_consecutive_count(ctx);

        out_result->current_state = STATE_CRITICAL;
        out_result->message_type = MESSAGE_ALERT;
        out_result->state_changed = false;
        out_result->should_send_message = true;
    }

    ctx->last_diagnosis_level = diagnosis_result->l_final;
}

// state_logic_handle_device_fault_state:
// 시제품 운용 편의를 위해 센서 정상 상태가 3회 연속 확인되면 fault를 해제하고 재판정함
static void state_logic_handle_device_fault_state(state_logic_ctx_t *ctx,
                                                  uint32_t now_ms,
                                                  const diagnosis_result_t *diagnosis_result,
                                                  state_logic_result_t *out_result)
{
    if (diagnosis_result->l_fault == DIAGNOSIS_LEVEL_CRITICAL) {
        ctx->device_fault_recovery_count = 0U;
        state_logic_handle_device_fault(ctx, now_ms, diagnosis_result, out_result);
        ctx->last_diagnosis_level = diagnosis_result->l_final;
        return;
    }

    state_logic_increment_device_fault_recovery_count(ctx);

    if (ctx->device_fault_recovery_count < ctx->config.device_fault_recovery_count) {
        out_result->current_state = STATE_DEVICE_FAULT;
        out_result->message_type = MESSAGE_FAULT;
        out_result->state_changed = false;
        out_result->should_send_message = true;
        ctx->last_diagnosis_level = diagnosis_result->l_final;
        return;
    }

    state_logic_enter_normal(ctx, now_ms);
    ctx->last_diagnosis_level = DIAGNOSIS_LEVEL_NORMAL;
    state_logic_handle_normal_state(ctx, now_ms, diagnosis_result, out_result);
    if (!out_result->state_changed && out_result->current_state != STATE_DEVICE_FAULT) {
        out_result->state_changed = true;
        out_result->should_send_message = true;
        if (out_result->message_type == MESSAGE_HEARTBEAT) {
            out_result->message_type = MESSAGE_EVENT;
        }
    }
}

// 공개 API 구현
void state_logic_get_default_config(state_logic_config_t *out_config)
{
    if (out_config == NULL) {
        return;
    }

    out_config->warning_entry_count = STATE_LOGIC_DEFAULT_WARNING_ENTRY_COUNT;
    out_config->critical_entry_count = STATE_LOGIC_DEFAULT_CRITICAL_ENTRY_COUNT;
    out_config->normal_entry_count = STATE_LOGIC_DEFAULT_NORMAL_ENTRY_COUNT;
    out_config->normal_summary_publish_interval_ms =
        STATE_LOGIC_DEFAULT_NORMAL_SUMMARY_PUBLISH_INTERVAL_MS;
    out_config->device_fault_recovery_count = STATE_LOGIC_DEFAULT_DEVICE_FAULT_RECOVERY_COUNT;
}

esp_err_t state_logic_init(state_logic_ctx_t *ctx, const state_logic_config_t *config,
                          uint32_t now_ms)
{
    state_logic_config_t effective_config;

    if (ctx == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    if (config == NULL) {
        state_logic_get_default_config(&effective_config);
    } else {
        effective_config = *config;
    }

    if (!state_logic_is_valid_config(&effective_config)) {
        return ESP_ERR_INVALID_ARG;
    }

    memset(ctx, 0, sizeof(*ctx));
    ctx->config = effective_config;
    ctx->current_state = STATE_NORMAL;
    ctx->state_entry_time_ms = now_ms;
    ctx->last_summary_publish_time_ms = now_ms;
    ctx->last_diagnosis_level = DIAGNOSIS_LEVEL_NORMAL;

    return ESP_OK;
}

esp_err_t state_logic_update(state_logic_ctx_t *ctx,
                            const diagnosis_result_t *diagnosis_result,
                            uint32_t now_ms,
                            state_logic_result_t *out_result)
{
    if (ctx == NULL || diagnosis_result == NULL || out_result == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    if (!state_logic_is_valid_config(&ctx->config)) {
        return ESP_ERR_INVALID_STATE;
    }

    memset(out_result, 0, sizeof(*out_result));

    if (ctx->current_state == STATE_DEVICE_FAULT) {
        state_logic_handle_device_fault_state(ctx, now_ms, diagnosis_result, out_result);
        return ESP_OK;
    }

    // device_fault 진단이 있으면 즉시 fault 상태로 전이
    if (diagnosis_result->l_fault == DIAGNOSIS_LEVEL_CRITICAL) {
        state_logic_handle_device_fault(ctx, now_ms, diagnosis_result, out_result);
        ctx->last_diagnosis_level = diagnosis_result->l_final;
        return ESP_OK;
    }

    // 현재 상태에 따라 상태 전이 로직 실행
    switch (ctx->current_state) {
        case STATE_NORMAL:
            state_logic_handle_normal_state(ctx, now_ms, diagnosis_result, out_result);
            break;

        case STATE_WARNING:
            state_logic_handle_warning_state(ctx, now_ms, diagnosis_result, out_result);
            break;

        case STATE_CRITICAL:
            state_logic_handle_critical_state(ctx, now_ms, diagnosis_result, out_result);
            break;

        default:
            return ESP_ERR_INVALID_STATE;
    }

    return ESP_OK;
}

const char *state_logic_get_state_name(state_logic_state_t state)
{
    switch (state) {
        case STATE_NORMAL:
            return "normal";
        case STATE_WARNING:
            return "warning";
        case STATE_CRITICAL:
            return "critical";
        case STATE_DEVICE_FAULT:
            return "device_fault";
        default:
            return "unknown";
    }
}

const char *state_logic_get_message_type_name(state_logic_message_type_t message_type)
{
    switch (message_type) {
        case MESSAGE_SUMMARY:
            return "summary";
        case MESSAGE_EVENT:
            return "event";
        case MESSAGE_ALERT:
            return "alert";
        case MESSAGE_FAULT:
            return "fault";
        case MESSAGE_HEARTBEAT:
            return "heartbeat";
        default:
            return "unknown";
    }
}
