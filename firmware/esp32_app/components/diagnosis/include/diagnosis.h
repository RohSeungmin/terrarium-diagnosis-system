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

// 진단 지표
typedef struct {
    diagnosis_level_t l_match;      // 열원 작동-환경 불일치 지표
    diagnosis_level_t l_grad;       // 온도 구배 봉쇄 지표
    diagnosis_level_t l_safety;     // 안전 임계값 지표
    diagnosis_level_t l_fault;      // 장치 이상 지표 (0: normal, 2: device_fault)
    diagnosis_level_t l_final;      // 최종 진단 (max(l_match, l_grad, l_safety))
    const char *fault_reason;       // 장치 이상 원인 설명
} diagnosis_result_t;

// 진단 설정 
typedef struct {
    // L_match 설정
    uint32_t heat_warmup_time_ms;   // Heat source ON 후 온도 상승 추적 시간
    float heat_response_threshold_c; // 최소 온도 상승량c
    
    // L_grad 설정
    float gradient_normal_threshold_c;  // θ_warn: normal 온도구배 임계값
    float gradient_critical_threshold_c; // θ_crit: critical 온도구배 임계값
    
    // L_safety 설정
    float surface_temp_warn_c;      // T_surface,warn: 경고 수준 표면 온도
    float surface_temp_crit_c;      // T_surface,crit: 위험 수준 표면 온도
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

#ifdef __cplusplus
}
#endif

#endif // DIAGNOSIS_H
