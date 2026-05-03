#ifndef COMMS_PAYLOAD_H
#define COMMS_PAYLOAD_H

#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

#include "comms.h"

// comms_build_payload:
// 메시지 종류에 따라 summary/event/alert/fault JSON payload를 생성하는 내부 함수
esp_err_t comms_build_payload(char *payload,
                              size_t payload_size,
                              const comms_ctx_t *ctx,
                              const comms_message_policy_t *policy,
                              comms_message_kind_t kind,
                              const preprocess_result_t *preprocess_result,
                              const diagnosis_result_t *diagnosis_result,
                              const state_logic_result_t *state_logic_result,
                              uint32_t now_ms);

// comms_build_heartbeat_payload:
// 노드 생존 확인용 heartbeat JSON payload를 생성하는 내부 함수
esp_err_t comms_build_heartbeat_payload(char *payload,
                                        size_t payload_size,
                                        const comms_ctx_t *ctx,
                                        state_logic_state_t current_state,
                                        bool mqtt_connected,
                                        uint32_t now_ms);

#endif
