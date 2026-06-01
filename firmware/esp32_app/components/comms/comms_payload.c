/*
 * comms_payload.c
 *
 * 역할:
 * - preprocess, diagnosis, state_logic 결과를 MQTT JSON payload로 변환함
 * - summary/event/alert/fault와 heartbeat payload 구조를 관리함
 * - 상태 판단이나 MQTT 전송은 수행하지 않음
 *
 */

#include "comms_payload.h"

#include <math.h>
#include <stdarg.h>
#include <stddef.h>
#include <stdio.h>

// comms_json_writer_t:
// - 고정 크기 버퍼에 JSON 문자열을 순차적으로 작성하기 위한 내부 helper 상태
// - overflow가 true가 되면 이후 append를 중단해서 잘린 JSON을 발행하지 않도록 함
typedef struct {
    char *buffer;
    size_t capacity;
    size_t length;
    bool overflow;
} comms_json_writer_t;

// comms_json_append:
// JSON writer의 남은 버퍼에 printf 형식 문자열을 추가하는 함수
// 버퍼가 부족하면 overflow를 표시하고 payload 생성 단계에서 실패로 처리함
static void comms_json_append(comms_json_writer_t *writer, const char *fmt, ...)
{
    if (writer == NULL || writer->buffer == NULL || writer->capacity == 0U ||
        writer->overflow || writer->length >= writer->capacity) {
        return;
    }

    va_list args;
    va_start(args, fmt);
    int written = vsnprintf(writer->buffer + writer->length,
                            writer->capacity - writer->length,
                            fmt,
                            args);
    va_end(args);

    if (written < 0) {
        writer->overflow = true;
        writer->buffer[writer->capacity - 1U] = '\0';
        return;
    }

    const size_t remaining = writer->capacity - writer->length;
    if ((size_t)written >= remaining) {
        writer->overflow = true;
        writer->length = writer->capacity - 1U;
        writer->buffer[writer->length] = '\0';
        return;
    }

    writer->length += (size_t)written;
}

// comms_json_append_string_value:
// JSON 문자열 값에 필요한 escape 처리를 적용해서 writer에 추가하는 함수
static void comms_json_append_string_value(comms_json_writer_t *writer, const char *value)
{
    if (value == NULL) {
        comms_json_append(writer, "null");
        return;
    }

    comms_json_append(writer, "\"");
    for (const unsigned char *cursor = (const unsigned char *)value; *cursor != '\0'; cursor++) {
        switch (*cursor) {
            case '"':
                comms_json_append(writer, "\\\"");
                break;
            case '\\':
                comms_json_append(writer, "\\\\");
                break;
            case '\b':
                comms_json_append(writer, "\\b");
                break;
            case '\f':
                comms_json_append(writer, "\\f");
                break;
            case '\n':
                comms_json_append(writer, "\\n");
                break;
            case '\r':
                comms_json_append(writer, "\\r");
                break;
            case '\t':
                comms_json_append(writer, "\\t");
                break;
            default:
                if (*cursor < 0x20U) {
                    comms_json_append(writer, "\\u%04x", (unsigned int)*cursor);
                } else {
                    comms_json_append(writer, "%c", *cursor);
                }
                break;
        }
    }
    comms_json_append(writer, "\"");
}

// comms_cause_flags_name:
// 내부 비트마스크 원인 플래그를 서버 저장용 문자열 코드로 변환하는 함수
static const char *comms_cause_flags_name(diagnosis_cause_flags_t flags)
{
    if ((flags & DIAGNOSIS_CAUSE_L_SAFETY) != 0U) {
        return "SAFETY_OVER";
    }
    if ((flags & DIAGNOSIS_CAUSE_L_GRAD) != 0U) {
        return "GRAD_LOW";
    }
    if ((flags & DIAGNOSIS_CAUSE_L_MATCH) != 0U) {
        return "HEAT_RESPONSE_LOW";
    }
    if ((flags & DIAGNOSIS_CAUSE_SENSOR_RESPONSE_FAILURE) != 0U) {
        return "SENSOR_RESPONSE_FAILURE";
    }
    if ((flags & DIAGNOSIS_CAUSE_PERSISTENT_OUT_OF_RANGE_VALUE) != 0U) {
        return "PERSISTENT_OUT_OF_RANGE_VALUE";
    }
    if ((flags & DIAGNOSIS_CAUSE_OUT_OF_RANGE_VALUE) != 0U) {
        return "OUT_OF_RANGE_VALUE";
    }
    if ((flags & DIAGNOSIS_CAUSE_MISSING_VALUE) != 0U) {
        return "MISSING_VALUE";
    }
    if ((flags & DIAGNOSIS_CAUSE_REPEATED_VALUE) != 0U) {
        return "REPEATED_VALUE";
    }

    return NULL;
}

// comms_json_append_bool:
// bool 값을 JSON true/false 값으로 추가하는 함수
static void comms_json_append_bool(comms_json_writer_t *writer, bool value)
{
    comms_json_append(writer, "%s", value ? "true" : "false");
}

// comms_json_append_float_or_null:
// 센서값이나 계산값을 JSON 숫자로 추가하되, 값이 유효하지 않으면 null로 추가하는 함수
static void comms_json_append_float_or_null(comms_json_writer_t *writer, float value, bool ok)
{
    if (!ok || !isfinite(value)) {
        comms_json_append(writer, "null");
        return;
    }

    comms_json_append(writer, "%.2f", (double)value);
}

// comms_json_append_int_or_null:
// 정수 센서값을 JSON 숫자로 추가하되, 값이 유효하지 않으면 null로 추가하는 함수
static void comms_json_append_int_or_null(comms_json_writer_t *writer, int value, bool ok)
{
    if (!ok) {
        comms_json_append(writer, "null");
        return;
    }

    comms_json_append(writer, "%d", value);
}

// comms_kind_name:
// comms 내부 메시지 종류를 서버 payload에 넣을 message_type 문자열로 변환하는 함수
static const char *comms_kind_name(comms_message_kind_t kind)
{
    switch (kind) {
        case COMMS_MESSAGE_SUMMARY:
            return "summary";
        case COMMS_MESSAGE_EVENT:
            return "event";
        case COMMS_MESSAGE_ALERT:
            return "alert";
        case COMMS_MESSAGE_FAULT:
            return "fault";
        default:
            return "unknown";
    }
}

// comms_append_common_fields:
// summary/event/alert/fault payload에 공통으로 들어가는 metadata를 추가하는 함수
static void comms_append_common_fields(comms_json_writer_t *writer,
                                       const comms_ctx_t *ctx,
                                       comms_message_kind_t kind,
                                       const state_logic_result_t *state_logic_result,
                                       const comms_message_policy_t *policy,
                                       uint32_t now_ms)
{
    comms_json_append(writer, "{\"schema\":\"terrarium-diagnosis.v1\"");

    comms_json_append(writer, ",\"node_id\":");
    comms_json_append_string_value(writer, ctx->config.node_id);

    comms_json_append(writer, ",\"timestamp_ms\":%lu", (unsigned long)now_ms);

    comms_json_append(writer, ",\"state\":");
    comms_json_append_string_value(writer, state_logic_get_state_name(state_logic_result->current_state));

    comms_json_append(writer, ",\"message_type\":");
    comms_json_append_string_value(writer, comms_kind_name(kind));

    comms_json_append(writer, ",\"state_changed\":");
    comms_json_append_bool(writer, state_logic_result->state_changed);

    comms_json_append(writer, ",\"qos\":%d", policy->qos);
    comms_json_append(writer, ",\"retain\":");
    comms_json_append_bool(writer, policy->retain);
    comms_json_append(writer, ",\"message_expiry_ms\":%lu", (unsigned long)policy->expiry_ms);
}

// comms_append_summary_value:
// preprocess summary window의 평균/최소/최대/샘플 수를 JSON object로 추가하는 함수
static void comms_append_summary_value(comms_json_writer_t *writer,
                                       const char *name,
                                       const preprocess_summary_value_t *summary)
{
    comms_json_append(writer, "\"%s\":{\"ok\":", name);
    comms_json_append_bool(writer, summary != NULL && summary->ok);
    comms_json_append(writer, ",\"sample_count\":%lu",
                      summary == NULL ? 0UL : (unsigned long)summary->sample_count);
    comms_json_append(writer, ",\"average\":");
    comms_json_append_float_or_null(writer,
                                    summary == NULL ? 0.0f : summary->average,
                                    summary != NULL && summary->ok);
    comms_json_append(writer, ",\"min\":");
    comms_json_append_float_or_null(writer,
                                    summary == NULL ? 0.0f : summary->min,
                                    summary != NULL && summary->ok);
    comms_json_append(writer, ",\"max\":");
    comms_json_append_float_or_null(writer,
                                    summary == NULL ? 0.0f : summary->max,
                                    summary != NULL && summary->ok);
    comms_json_append(writer, "}");
}

// comms_append_sensor_status:
// 센서 응답, 결측, 범위 이상, 고정값 반복, 센서별 ok 상태를 payload에 추가하는 함수
static void comms_append_sensor_status(comms_json_writer_t *writer,
                                       const preprocess_result_t *preprocess_result)
{
    const sensor_data_t *cleaned = &preprocess_result->cleaned;

    comms_json_append(writer, "\"sensor_status\":{");
    comms_json_append(writer, "\"usable_for_diagnosis\":");
    comms_json_append_bool(writer, preprocess_result->usable_for_diagnosis);
    comms_json_append(writer, ",\"response_failure\":");
    comms_json_append_bool(writer, preprocess_result->has_sensor_response_failure);
    comms_json_append(writer, ",\"missing_value\":");
    comms_json_append_bool(writer, preprocess_result->has_missing_value);
    comms_json_append(writer, ",\"out_of_range_value\":");
    comms_json_append_bool(writer, preprocess_result->has_out_of_range_value);
    comms_json_append(writer, ",\"persistent_out_of_range_value\":");
    comms_json_append_bool(writer, preprocess_result->has_persistent_out_of_range_value);
    comms_json_append(writer, ",\"repeated_value\":");
    comms_json_append_bool(writer, preprocess_result->has_repeated_value);
    comms_json_append(writer, ",\"hot_surface_ok\":");
    comms_json_append_bool(writer, cleaned->hot_surface_ok);
    comms_json_append(writer, ",\"hot_air_ok\":");
    comms_json_append_bool(writer, cleaned->hot_air_ok);
    comms_json_append(writer, ",\"cool_air_ok\":");
    comms_json_append_bool(writer, cleaned->cool_air_ok);
    comms_json_append(writer, ",\"light_ok\":");
    comms_json_append_bool(writer, cleaned->light_ok);
    comms_json_append(writer, "}");
}

// comms_append_sensor_values:
// 전처리된 현재 센서값을 payload에 추가하는 함수
// 센서별 ok 값이 false이면 해당 값은 null로 보냄
static void comms_append_sensor_values(comms_json_writer_t *writer,
                                       const preprocess_result_t *preprocess_result)
{
    const sensor_data_t *cleaned = &preprocess_result->cleaned;

    comms_json_append(writer, "\"sensor_values\":{");
    comms_json_append(writer, "\"hot_surface_temp_c\":");
    comms_json_append_float_or_null(writer, cleaned->hot_surface_temp_c, cleaned->hot_surface_ok);
    comms_json_append(writer, ",\"hot_air_temp_c\":");
    comms_json_append_float_or_null(writer, cleaned->hot_air_temp_c, cleaned->hot_air_ok);
    comms_json_append(writer, ",\"cool_air_temp_c\":");
    comms_json_append_float_or_null(writer, cleaned->cool_air_temp_c, cleaned->cool_air_ok);
    comms_json_append(writer, ",\"light_level\":");
    comms_json_append_int_or_null(writer, cleaned->light_level, cleaned->light_ok);
    comms_json_append(writer, "}");
}

// comms_append_features:
// 온도구배, 열원 상태, 열원 작동 시간, 표면 온도 변화량 등 진단 feature를 추가하는 함수
static void comms_append_features(comms_json_writer_t *writer,
                                  const preprocess_result_t *preprocess_result)
{
    comms_json_append(writer, "\"features\":{");
    comms_json_append(writer, "\"temp_gradient_ok\":");
    comms_json_append_bool(writer, preprocess_result->temp_gradient_ok);
    comms_json_append(writer, ",\"temp_gradient_c\":");
    comms_json_append_float_or_null(writer,
                                    preprocess_result->temp_gradient_c,
                                    preprocess_result->temp_gradient_ok);
    comms_json_append(writer, ",\"heat_source_state_ok\":");
    comms_json_append_bool(writer, preprocess_result->heat_source_state_ok);
    comms_json_append(writer, ",\"heat_source_on\":");
    comms_json_append_bool(writer, preprocess_result->heat_source_on);
    comms_json_append(writer, ",\"heat_source_on_since_ms\":%lu",
                      (unsigned long)preprocess_result->heat_source_on_since_ms);
    comms_json_append(writer, ",\"heat_source_on_duration_ms\":%lu",
                      (unsigned long)preprocess_result->heat_source_on_duration_ms);
    comms_json_append(writer, ",\"surface_temp_step_delta_ok\":");
    comms_json_append_bool(writer, preprocess_result->surface_temp_step_delta_ok);
    comms_json_append(writer, ",\"surface_temp_step_delta_c\":");
    comms_json_append_float_or_null(writer,
                                    preprocess_result->surface_temp_step_delta_c,
                                    preprocess_result->surface_temp_step_delta_ok);
    comms_json_append(writer, ",\"surface_temp_rise_since_heat_on_ok\":");
    comms_json_append_bool(writer, preprocess_result->surface_temp_rise_since_heat_on_ok);
    comms_json_append(writer, ",\"surface_temp_rise_since_heat_on_c\":");
    comms_json_append_float_or_null(writer,
                                    preprocess_result->surface_temp_rise_since_heat_on_c,
                                    preprocess_result->surface_temp_rise_since_heat_on_ok);
    comms_json_append(writer, "}");
}

// comms_append_diagnosis:
// diagnosis 단계에서 계산된 Lmatch/Lgrad/Lsafety/Lfinal과 원인 플래그를 추가하는 함수
static void comms_append_diagnosis(comms_json_writer_t *writer,
                                   const diagnosis_result_t *diagnosis_result)
{
    comms_json_append(writer, "\"diagnosis\":{");
    comms_json_append(writer, "\"status\":");
    comms_json_append_string_value(writer, diagnosis_get_status_name(diagnosis_result->final_status));
    comms_json_append(writer, ",\"l_match\":%u", (unsigned int)diagnosis_result->l_match);
    comms_json_append(writer, ",\"l_grad\":%u", (unsigned int)diagnosis_result->l_grad);
    comms_json_append(writer, ",\"l_safety\":%u", (unsigned int)diagnosis_result->l_safety);
    comms_json_append(writer, ",\"l_fault\":%u", (unsigned int)diagnosis_result->l_fault);
    comms_json_append(writer, ",\"l_final\":%u", (unsigned int)diagnosis_result->l_final);
    comms_json_append(writer, ",\"cause_flags\":");
    comms_json_append_string_value(writer, comms_cause_flags_name(diagnosis_result->cause_flags));
    comms_json_append(writer, ",\"fault_reason\":");
    comms_json_append_string_value(writer, diagnosis_result->fault_reason);
    comms_json_append(writer, "}");
}

// comms_build_summary_payload:
// normal 상태에서 저주기로 전송할 summary JSON payload를 생성하는 함수
static esp_err_t comms_build_summary_payload(char *payload,
                                             size_t payload_size,
                                             const comms_ctx_t *ctx,
                                             const comms_message_policy_t *policy,
                                             const preprocess_result_t *preprocess_result,
                                             const state_logic_result_t *state_logic_result,
                                             uint32_t now_ms)
{
    comms_json_writer_t writer = {
        .buffer = payload,
        .capacity = payload_size,
    };

    comms_append_common_fields(&writer,
                               ctx,
                               COMMS_MESSAGE_SUMMARY,
                               state_logic_result,
                               policy,
                               now_ms);

    comms_json_append(&writer, ",\"summary\":{\"ready\":");
    comms_json_append_bool(&writer, preprocess_result->summary.ready);
    comms_json_append(&writer, ",\"window_sample_count\":%lu",
                      (unsigned long)preprocess_result->summary.window_sample_count);
    comms_json_append(&writer, ",\"window_capacity\":%lu,",
                      (unsigned long)preprocess_result->summary.window_capacity);
    comms_append_summary_value(&writer,
                               "hot_surface_temp_c",
                               &preprocess_result->summary.hot_surface_temp_c);
    comms_json_append(&writer, ",");
    comms_append_summary_value(&writer,
                               "hot_air_temp_c",
                               &preprocess_result->summary.hot_air_temp_c);
    comms_json_append(&writer, ",");
    comms_append_summary_value(&writer,
                               "cool_air_temp_c",
                               &preprocess_result->summary.cool_air_temp_c);
    comms_json_append(&writer, ",");
    comms_append_summary_value(&writer,
                               "light_level",
                               &preprocess_result->summary.light_level);
    comms_json_append(&writer, ",");
    comms_append_summary_value(&writer,
                               "temp_gradient_c",
                               &preprocess_result->summary.temp_gradient_c);
    comms_json_append(&writer, "}");

    comms_json_append(&writer, ",\"heat_source\":{\"state_ok\":");
    comms_json_append_bool(&writer, preprocess_result->heat_source_state_ok);
    comms_json_append(&writer, ",\"on\":");
    comms_json_append_bool(&writer, preprocess_result->heat_source_on);
    comms_json_append(&writer, ",\"on_duration_ms\":%lu}",
                      (unsigned long)preprocess_result->heat_source_on_duration_ms);

    comms_json_append(&writer, ",");
    comms_append_sensor_status(&writer, preprocess_result);
    comms_json_append(&writer, "}");

    return writer.overflow ? ESP_ERR_NO_MEM : ESP_OK;
}

// comms_build_diagnostic_payload:
// warning/critical 상태 또는 상태 전이 이벤트에 사용할 상세 진단 JSON payload를 생성하는 함수
static esp_err_t comms_build_diagnostic_payload(char *payload,
                                                size_t payload_size,
                                                const comms_ctx_t *ctx,
                                                const comms_message_policy_t *policy,
                                                comms_message_kind_t kind,
                                                const preprocess_result_t *preprocess_result,
                                                const diagnosis_result_t *diagnosis_result,
                                                const state_logic_result_t *state_logic_result,
                                                uint32_t now_ms)
{
    comms_json_writer_t writer = {
        .buffer = payload,
        .capacity = payload_size,
    };

    comms_append_common_fields(&writer, ctx, kind, state_logic_result, policy, now_ms);

    comms_json_append(&writer, ",");
    comms_append_sensor_values(&writer, preprocess_result);
    comms_json_append(&writer, ",");
    comms_append_features(&writer, preprocess_result);
    comms_json_append(&writer, ",");
    comms_append_diagnosis(&writer, diagnosis_result);
    comms_json_append(&writer, ",\"state_transition\":{\"state_changed\":");
    comms_json_append_bool(&writer, state_logic_result->state_changed);
    comms_json_append(&writer, "}");
    comms_json_append(&writer, ",");
    comms_append_sensor_status(&writer, preprocess_result);
    comms_json_append(&writer, "}");

    return writer.overflow ? ESP_ERR_NO_MEM : ESP_OK;
}

// comms_build_fault_payload:
// device fault 상태에서 센서/노드 이상 정보를 전송할 fault JSON payload를 생성하는 함수
static esp_err_t comms_build_fault_payload(char *payload,
                                           size_t payload_size,
                                           const comms_ctx_t *ctx,
                                           const comms_message_policy_t *policy,
                                           const preprocess_result_t *preprocess_result,
                                           const diagnosis_result_t *diagnosis_result,
                                           const state_logic_result_t *state_logic_result,
                                           uint32_t now_ms)
{
    comms_json_writer_t writer = {
        .buffer = payload,
        .capacity = payload_size,
    };

    comms_append_common_fields(&writer,
                               ctx,
                               COMMS_MESSAGE_FAULT,
                               state_logic_result,
                               policy,
                               now_ms);

    comms_json_append(&writer, ",\"fault\":{\"sensor_response_failure\":");
    comms_json_append_bool(&writer, preprocess_result->has_sensor_response_failure);
    comms_json_append(&writer, ",\"missing_value\":");
    comms_json_append_bool(&writer, preprocess_result->has_missing_value);
    comms_json_append(&writer, ",\"out_of_range_value\":");
    comms_json_append_bool(&writer, preprocess_result->has_out_of_range_value);
    comms_json_append(&writer, ",\"persistent_out_of_range_value\":");
    comms_json_append_bool(&writer, preprocess_result->has_persistent_out_of_range_value);
    comms_json_append(&writer, ",\"repeated_value\":");
    comms_json_append_bool(&writer, preprocess_result->has_repeated_value);
    comms_json_append(&writer, ",\"fault_reason\":");
    comms_json_append_string_value(&writer, diagnosis_result->fault_reason);
    comms_json_append(&writer, "}");

    comms_json_append(&writer, ",");
    comms_append_sensor_values(&writer, preprocess_result);
    comms_json_append(&writer, ",");
    comms_append_sensor_status(&writer, preprocess_result);
    comms_json_append(&writer, ",");
    comms_append_diagnosis(&writer, diagnosis_result);
    comms_json_append(&writer, "}");

    return writer.overflow ? ESP_ERR_NO_MEM : ESP_OK;
}

// 공개 API 구현

// comms_build_payload:
// 메시지 종류에 따라 summary/event/alert/fault payload builder를 선택하는 함수
esp_err_t comms_build_payload(char *payload,
                              size_t payload_size,
                              const comms_ctx_t *ctx,
                              const comms_message_policy_t *policy,
                              comms_message_kind_t kind,
                              const preprocess_result_t *preprocess_result,
                              const diagnosis_result_t *diagnosis_result,
                              const state_logic_result_t *state_logic_result,
                              uint32_t now_ms)
{
    if (payload == NULL || payload_size == 0U) {
        return ESP_ERR_INVALID_ARG;
    }

    payload[0] = '\0';

    if (ctx == NULL || policy == NULL || preprocess_result == NULL ||
        state_logic_result == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    switch (kind) {
        case COMMS_MESSAGE_SUMMARY:
            return comms_build_summary_payload(payload,
                                               payload_size,
                                               ctx,
                                               policy,
                                               preprocess_result,
                                               state_logic_result,
                                               now_ms);
        case COMMS_MESSAGE_EVENT:
        case COMMS_MESSAGE_ALERT:
            if (diagnosis_result == NULL) {
                return ESP_ERR_INVALID_ARG;
            }
            return comms_build_diagnostic_payload(payload,
                                                  payload_size,
                                                  ctx,
                                                  policy,
                                                  kind,
                                                  preprocess_result,
                                                  diagnosis_result,
                                                  state_logic_result,
                                                  now_ms);
        case COMMS_MESSAGE_FAULT:
            if (diagnosis_result == NULL) {
                return ESP_ERR_INVALID_ARG;
            }
            return comms_build_fault_payload(payload,
                                             payload_size,
                                             ctx,
                                             policy,
                                             preprocess_result,
                                             diagnosis_result,
                                             state_logic_result,
                                             now_ms);
        default:
            return ESP_ERR_INVALID_ARG;
    }
}

// comms_build_heartbeat_payload:
// 노드 생존 확인용 heartbeat JSON payload를 생성하는 함수
esp_err_t comms_build_heartbeat_payload(char *payload,
                                        size_t payload_size,
                                        const comms_ctx_t *ctx,
                                        state_logic_state_t current_state,
                                        bool mqtt_connected,
                                        uint32_t now_ms)
{
    if (payload == NULL || payload_size == 0U || ctx == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    comms_json_writer_t writer = {
        .buffer = payload,
        .capacity = payload_size,
    };

    payload[0] = '\0';

    comms_json_append(&writer, "{\"schema\":\"terrarium-diagnosis.v1\"");
    comms_json_append(&writer, ",\"node_id\":");
    comms_json_append_string_value(&writer, ctx->config.node_id);
    comms_json_append(&writer, ",\"timestamp_ms\":%lu", (unsigned long)now_ms);
    comms_json_append(&writer, ",\"message_type\":\"heartbeat\"");
    comms_json_append(&writer, ",\"state\":");
    comms_json_append_string_value(&writer, state_logic_get_state_name(current_state));
    comms_json_append(&writer, ",\"mqtt_connected\":");
    comms_json_append_bool(&writer, mqtt_connected);
    comms_json_append(&writer, ",\"uptime_ms\":%lu", (unsigned long)now_ms);
    comms_json_append(&writer, "}");

    return writer.overflow ? ESP_ERR_NO_MEM : ESP_OK;
}
