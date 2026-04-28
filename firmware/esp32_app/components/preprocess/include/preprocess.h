#ifndef PREPROCESS_H
#define PREPROCESS_H

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

#include "sensors.h"

// 전처리 기본 설정값
#define PREPROCESS_DEFAULT_REPEAT_THRESHOLD 3U
#define PREPROCESS_DEFAULT_MIN_TEMP_C (-55.0f)
#define PREPROCESS_DEFAULT_MAX_TEMP_C 125.0f
#define PREPROCESS_DEFAULT_MIN_LIGHT_LEVEL 0
#define PREPROCESS_DEFAULT_MAX_LIGHT_LEVEL 120000
#define PREPROCESS_DEFAULT_HEAT_SOURCE_ON_LIGHT_LEVEL 1000

// preprocess_config_t:
// - 전처리에서 사용할 판단 기준값을 저장하는 구조체
// - 여기서 확인하는 온도/조도 범위는 사육장 정상 범위가 아니라
//   "센서값으로 인정할 수 있는 물리적/측정 가능 범위"를 의미함
typedef struct {
    uint32_t repeated_value_threshold; // 동일값 반복으로 판단할 연속 반복 횟수 기준
    float min_temp_c; // 센서값으로 인정할 최소 유효 온도
    float max_temp_c; // 센서값으로 인정할 최대 유효 온도
    int min_light_level; // 센서값으로 인정할 최소 유효 조도
    int max_light_level; // 센서값으로 인정할 최대 유효 조도
    int heat_source_on_light_level; // 이 조도값 이상이면 열원이 켜진 것으로 추정하는 기준
} preprocess_config_t;

// preprocess_ctx_t:
// - 이전 센서값, 동일값 반복 횟수, 이전 열원 상태를 저장하는 전처리 상태 구조체
// - 동일값 반복 확인, 표면 온도 변화량 계산, 열원 작동 시간 계산에 사용함
// - 열원이 켜진 시점의 표면 온도를 저장해서 "작동 시간 대비 온도 상승량" 계산에 사용함
typedef struct {
    bool has_previous; // 이전 센서 데이터가 저장되어 있는지 여부
    sensor_data_t previous; // 동일값 반복 체크에 사용할 이전 센서 데이터

    uint32_t hot_surface_repeat_count; // 온열 구역 표면 온도 동일값 반복 횟수
    uint32_t hot_air_repeat_count; // 온열 구역 공기 온도 동일값 반복 횟수
    uint32_t cool_air_repeat_count; // 냉각 구역 공기 온도 동일값 반복 횟수
    uint32_t light_repeat_count; // 조도 동일값 반복 횟수

    bool has_previous_heat_source_state; // 이전 열원 작동 상태가 저장되어 있는지 여부
    bool previous_heat_source_on; // 이전 전처리 시점의 열원 작동 상태
    uint32_t heat_source_on_since_ms; // 열원이 켜진 것으로 판단된 시작 시각
    bool has_heat_source_on_surface_temp_baseline; // 열원 ON 시점 표면 온도 기준값이 저장되어 있는지 여부
    float heat_source_on_surface_temp_c; // 열원이 켜진 시점의 온열 구역 표면 온도

    preprocess_config_t config; // 전처리 기준 설정값
} preprocess_ctx_t;

// preprocess_result_t:
// - 전처리 결과와 이후 diagnosis 단계에서 사용할 기본 계산값을 저장하는 구조체
// - 결측/응답 실패/범위 이상/동일값 반복 여부를 표시하고,
//   온도구배, 열원 작동 시간, 표면 온도 변화량, 열원 ON 이후 표면 온도 상승량을 함께 제공함
typedef struct {
    sensor_data_t cleaned; // 전처리 후 이후 단계에 전달할 정리된 센서 데이터

    bool has_missing_value; // 필요한 센서값이 비어 있거나 유효하지 않은지 여부
    bool has_sensor_response_failure; // sensors_read_all() 또는 개별 센서 응답 실패 여부
    bool has_out_of_range_value; // 설정된 센서 유효 범위를 벗어난 값이 있는지 여부
    bool has_repeated_value; // 동일값 반복 조건에 걸린 센서값이 있는지 여부

    bool temp_gradient_ok; // 온도구배 계산 가능 여부
    float temp_gradient_c; // 온도구배 G = hot_air_temp_c - cool_air_temp_c

    bool heat_source_state_ok; // 조도값을 바탕으로 현재 열원 작동 상태를 추정할 수 있는지 여부
    bool heat_source_on; // 현재 열원이 켜져 있는 것으로 추정되는지 여부
    uint32_t heat_source_on_since_ms; // 열원이 켜진 것으로 판단된 시작 시각
    uint32_t heat_source_on_duration_ms; // 현재 시각 기준 열원이 켜진 상태로 유지된 시간

    bool surface_temp_step_delta_ok; // 표면 온도 변화량 계산 가능 여부
    float surface_temp_step_delta_c; // 현재 온열 구역 표면 온도 - 이전 온열 구역 표면 온도

    bool surface_temp_rise_since_heat_on_ok; // 열원 ON 이후 표면 온도 상승량 계산 가능 여부
    float surface_temp_rise_since_heat_on_c; // 현재 표면 온도 - 열원 ON 시점의 표면 온도

    bool usable_for_diagnosis; // diagnosis 모듈에서 사용할 수 있는 데이터인지 여부
} preprocess_result_t;

// 기본 전처리 설정값을 out_config에 저장함
void preprocess_get_default_config(preprocess_config_t *out_config);

// 전처리 상태를 초기화함. config가 NULL이면 기본 설정값을 사용함
esp_err_t preprocess_init(preprocess_ctx_t *ctx, const preprocess_config_t *config);

// 원본 센서 데이터, 센서 읽기 결과, 현재 시각을 받아 전처리 결과를 생성함
// now_ms는 열원 작동 시작 시각, 작동 지속 시간, 작동 후 표면 온도 상승량 계산에 사용함
esp_err_t preprocess_update(preprocess_ctx_t *ctx, const sensor_data_t *raw_data, 
                            esp_err_t sensor_read_err, uint32_t now_ms,
                            preprocess_result_t *out_result);

#endif
