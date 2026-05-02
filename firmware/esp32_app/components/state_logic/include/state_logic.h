/*
 * state_logic.h
 *
 * 상태 전이 모듈의 헤더 파일
 * 진단 결과를 바탕으로 시스템 상태를 관리하고 메시지 타입을 결정
 */

#ifndef STATE_LOGIC_H
#define STATE_LOGIC_H

#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"
#include "diagnosis.h"

#ifdef __cplusplus
extern "C" {
#endif

// 시스템 상태 정의
typedef enum {
    STATE_NORMAL,       // 정상 상태 (평시 모드)
    STATE_WARNING,      // 경고 상태 (진단 모드)
    STATE_CRITICAL,     // 위험 상태 (진단 모드)
    STATE_DEVICE_FAULT  // 장치 이상 (즉시 알림)
} state_logic_state_t;

// 메시지 타입 정의
typedef enum {
    MESSAGE_SUMMARY,    // 평시 요약 (normal 상태에서만)
    MESSAGE_EVENT,      // 경고 이벤트 (warning 진입 시)
    MESSAGE_ALERT,      // 위험 알림 (critical 진입 시)
    MESSAGE_FAULT,      // 장치 이상 (device_fault 진입 시)
    MESSAGE_HEARTBEAT   // 생존 확인 (주기적)
} state_logic_message_type_t;

// 상태 전이 결과 구조체
typedef struct {
    state_logic_state_t current_state;          // 현재 상태
    state_logic_message_type_t message_type;    // 발행할 메시지 타입
    bool state_changed;                         // 상태 변경 여부
    bool should_send_message;                   // 메시지 발행 필요 여부
} state_logic_result_t;

// 상태 전이 설정 구조체
typedef struct {
    // 상태 진입 조건 (연속 관측 횟수)
    uint8_t warning_entry_count;    // normal → warning 진입에 필요한 연속 관측 횟수 (기본값: 2)
    uint8_t critical_entry_count;   // warning → critical 진입에 필요한 연속 관측 횟수 (기본값: 2)
    uint8_t normal_entry_count;     // warning/critical → normal 복귀에 필요한 연속 관측 횟수 (기본값: 3)
    
    // 평시 모드 최소 지속 시간 (밀리초)
    uint32_t normal_mode_min_duration_ms;   // 최소 180초
} state_logic_config_t;

// 상태 전이 컨텍스트 (내부 상태)
typedef struct {
    state_logic_config_t config;
    
    // 현재 상태
    state_logic_state_t current_state;
    
    // 상태 진입 시각
    uint32_t state_entry_time_ms;
    
    // 동일 진단 결과 연속 관측 횟수
    uint8_t consecutive_count;
    
    // 마지막 진단 결과
    diagnosis_level_t last_diagnosis_level;
} state_logic_ctx_t;

/**
 * state_logic_get_default_config
 * 기본 상태 전이 설정값을 out_config에 저장
 *
 * @param out_config: 출력할 설정 구조체 포인터
 */
void state_logic_get_default_config(state_logic_config_t *out_config);

/**
 * state_logic_init
 * 상태 전이 모듈을 초기화 (초기 상태: normal)
 *
 * @param ctx: 상태 전이 컨텍스트 포인터
 * @param config: 상태 전이 설정 (NULL이면 기본값 사용)
 * @param now_ms: 현재 시간 (밀리초)
 * @return ESP_OK 성공, ESP_ERR_INVALID_ARG 인자 오류
 */
esp_err_t state_logic_init(state_logic_ctx_t *ctx, const state_logic_config_t *config,
                          uint32_t now_ms);

/**
 * state_logic_update
 * 진단 결과를 바탕으로 상태를 전이시키고 메시지 타입을 결정
 *
 * @param ctx: 상태 전이 컨텍스트 포인터
 * @param diagnosis_result: 진단 결과
 * @param now_ms: 현재 시간 (밀리초)
 * @param out_result: 출력할 상태 전이 결과 포인터
 * @return ESP_OK 성공, ESP_ERR_INVALID_ARG 인자 오류
 */
esp_err_t state_logic_update(state_logic_ctx_t *ctx,
                            const diagnosis_result_t *diagnosis_result,
                            uint32_t now_ms,
                            state_logic_result_t *out_result);

/**
 * state_logic_get_state_name
 * 상태를 문자열로 변환 (디버깅용)
 *
 * @param state: 상태
 * @return 상태 문자열 포인터
 */
const char *state_logic_get_state_name(state_logic_state_t state);

/**
 * state_logic_get_message_type_name
 * 메시지 타입을 문자열로 변환 (디버깅용)
 *
 * @param message_type: 메시지 타입
 * @return 메시지 타입 문자열 포인터
 */
const char *state_logic_get_message_type_name(state_logic_message_type_t message_type);

#ifdef __cplusplus
}
#endif

#endif // STATE_LOGIC_H
