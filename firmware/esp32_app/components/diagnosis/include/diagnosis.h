/*
 * diagnosis.h
 *
 * 로컬 진단 모듈의 헤더 파일
 * 열원 작동-환경 불일치, 온도 구배, 안전 임계값을 기반으로 진단 지표를 계산
 */

#ifndef DIAGNOSIS_H
#define DIAGNOSIS_H

#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

// Forward declaration
typedef struct preprocess_result_t preprocess_result_t;

// 진단 레벨 정의 (0: normal, 1: warning, 2: critical)
typedef uint8_t diagnosis_level_t;

#define DIAGNOSIS_LEVEL_NORMAL 0
#define DIAGNOSIS_LEVEL_WARNING 1
#define DIAGNOSIS_LEVEL_CRITICAL 2

typedef enum {
    DIAGNOSIS_STATUS_NORMAL,
    DIAGNOSIS_STATUS_WARNING,
    DIAGNOSIS_STATUS_CRITICAL,
    DIAGNOSIS_STATUS_DEVICE_FAULT
} diagnosis_status_t;

typedef uint32_t diagnosis_cause_flags_t;

#define DIAGNOSIS_CAUSE_NONE 0U
#define DIAGNOSIS_CAUSE_L_MATCH (1U << 0)
#define DIAGNOSIS_CAUSE_L_GRAD (1U << 1)
#define DIAGNOSIS_CAUSE_L_SAFETY (1U << 2)
#define DIAGNOSIS_CAUSE_SENSOR_FAULT (1U << 3)
#define DIAGNOSIS_CAUSE_SENSOR_RESPONSE_FAILURE (1U << 4)
#define DIAGNOSIS_CAUSE_MISSING_VALUE (1U << 5)
#define DIAGNOSIS_CAUSE_OUT_OF_RANGE_VALUE (1U << 6)
#define DIAGNOSIS_CAUSE_PERSISTENT_OUT_OF_RANGE_VALUE (1U << 7)
#define DIAGNOSIS_CAUSE_REPEATED_VALUE (1U << 8)

// 진단 지표
typedef struct {
    diagnosis_level_t l_match;      // 열원 작동-환경 불일치 지표
    diagnosis_level_t l_grad;       // 온도 구배 봉쇄 지표
    diagnosis_level_t l_safety;     // 안전 임계값 지표
    diagnosis_level_t l_fault;      // 장치 이상 지표 (0: normal, 2: device_fault)
    diagnosis_level_t l_final;      // 최종 진단 (max(l_match, l_grad, l_safety))
    diagnosis_status_t final_status; // 최종 진단 상태
    diagnosis_cause_flags_t cause_flags; // 진단 원인 플래그
    const char *fault_reason;       // 장치 이상 원인 설명
} diagnosis_result_t;

// 진단 설정 
typedef struct {
    // L_match 설정
    uint32_t heat_response_warning_time_ms; // Heat source ON 후 warning 판단 시간(실험 보정 대상)
    uint32_t heat_response_critical_time_ms; // Heat source ON 후 critical 판단 시간(실험 보정 대상)
    float heat_response_threshold_c; // 열원 ON 이후 최소 표면 온도 상승량(실험 보정 대상)
    float basking_surface_target_min_c; // 온열 구역 표면 최소 목표 온도, ReptiFiles 기준 약 42C
    
    // L_grad 설정
    float air_gradient_normal_threshold_c;  // 온열 구역 공기 - 냉각 구역 공기 정상 구배 기준
    float air_gradient_critical_threshold_c; // 온열 구역 공기 - 냉각 구역 공기 critical 구배 기준
    
    // L_safety 설정
    float hot_surface_temp_warn_c; // 온열 구역 표면 온도 warning 기준: 45C
    float hot_surface_temp_crit_c; // 온열 구역 표면 온도 critical 기준: 50C
} diagnosis_config_t;

// 진단 상태 컨텍스트
typedef struct {
    diagnosis_config_t config;
} diagnosis_ctx_t;

/**
 * diagnosis_get_default_config
 * 기본 진단 설정값을 out_config에 저장
 *
 * @param out_config: 출력할 설정 구조체 포인터
 */
void diagnosis_get_default_config(diagnosis_config_t *out_config);

/**
 * 진단 모듈 초기화
 *
 * @param ctx: 진단 컨텍스트 포인터
 * @param config: 진단 설정 (NULL이면 기본값 사용)
 * @return ESP_OK 성공, ESP_ERR_INVALID_ARG 인자 오류
 */
esp_err_t diagnosis_init(diagnosis_ctx_t *ctx, const diagnosis_config_t *config);

/**
 * 전처리 결과 바탕 진단 지표 계산
 *
 * @param ctx: 진단 컨텍스트 포인터
 * @param preprocess_result: 전처리 결과
 * @param out_result: 진단 결과 포인터
 * @return ESP_OK 성공, ESP_ERR_INVALID_ARG 인자 오류
 */
esp_err_t diagnosis_update(const diagnosis_ctx_t *ctx,
                          const preprocess_result_t *preprocess_result,
                          diagnosis_result_t *out_result);

/**
 * diagnosis_get_status_name
 * 진단 상태를 문자열로 변환 (디버깅용)
 *
 * @param status: 진단 상태
 * @return 진단 상태 문자열 포인터
 */
const char *diagnosis_get_status_name(diagnosis_status_t status);

#ifdef __cplusplus
}
#endif

#endif // DIAGNOSIS_H
