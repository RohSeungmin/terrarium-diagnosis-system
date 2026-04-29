/*
 * main.c
 *
 * 역할:
 * - 시스템 전체 초기화 및 실행 흐름을 관리하는 진입점
 * - sensors 모듈로 센서값을 읽고 preprocess 모듈로 진단 전처리 결과를 생성함
 */

#include <stdio.h>
#include <stdint.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_err.h"
#include "esp_log.h"

#include "preprocess.h"
#include "sensors.h"

static const char *TAG = "app_main";

#define SENSOR_READ_INTERVAL_MS (30 * 1000) // 센서 읽기 시작 기준 간격 (밀리초)
#define SENSOR_INIT_RETRY_DELAY_MS 3000 // 센서 초기화 실패 시 재시도하기 전에 대기하는 시간 (밀리초)
#define SENSOR_RECOVERY_THRESHOLD 3 // 센서 읽기 실패가 연속으로 발생했을 때 재초기화를 시도하는 임계값

// get_uptime_ms:
// FreeRTOS tick count를 밀리초 단위 시스템 경과 시간으로 변환하는 함수
static uint32_t get_uptime_ms(void)
{
    return (uint32_t)pdTICKS_TO_MS(xTaskGetTickCount());
}

// log_preprocess_flags:
// 전처리 결과가 Device Fault 후보가 된 이유를 로그로 출력하는 함수
static void log_preprocess_flags(const preprocess_result_t *result)
{
    ESP_LOGW(TAG, "preprocess device fault candidate: response_failure=%d, missing=%d, out_of_range=%d, repeated=%d",
             (int)result->has_sensor_response_failure,
             (int)result->has_missing_value,
             (int)result->has_out_of_range_value,
             (int)result->has_repeated_value);
}

// print_preprocessed_data:
// 전처리 후 진단에 사용할 수 있는 센서값과 기본 계산값을 출력하는 함수
static void print_preprocessed_data(const preprocess_result_t *result)
{
    printf("Hot surface temp: %.2f C, Hot air temp: %.2f C, Cool air temp: %.2f C, "
           "Light: %d lux, Gradient: %.2f C, Heat source: %s, Heat duration: %lu ms\n",
           result->cleaned.hot_surface_temp_c,
           result->cleaned.hot_air_temp_c,
           result->cleaned.cool_air_temp_c,
           result->cleaned.light_level,
           result->temp_gradient_c,
           result->heat_source_on ? "ON" : "OFF",
           (unsigned long)result->heat_source_on_duration_ms);

    if (result->surface_temp_step_delta_ok) {
        printf("Surface temp step delta: %.2f C\n", result->surface_temp_step_delta_c);
    }

    if (result->surface_temp_rise_since_heat_on_ok) {
        printf("Surface temp rise since heat on: %.2f C\n",
               result->surface_temp_rise_since_heat_on_c);
    }
}

// wait_for_sensor_ready:
// 센서 초기화가 성공할 때까지 재시도하는 함수
static void wait_for_sensor_ready(void)
{
    esp_err_t err = ESP_OK;

    do {
        err = sensors_init();
        if (err == ESP_OK) {
            return;
        }

        ESP_LOGE(TAG, "sensor init failed: %s", esp_err_to_name(err));
        vTaskDelay(pdMS_TO_TICKS(SENSOR_INIT_RETRY_DELAY_MS));
    } while (1);
}

void app_main(void)
{
    unsigned int consecutive_read_failures = 0; // 센서 읽기 실패가 연속으로 발생한 횟수를 추적하는 변수
    preprocess_ctx_t preprocess_ctx = {0}; // 전처리에서 이전 센서값과 파생 상태를 저장하는 변수

    esp_err_t preprocess_err = preprocess_init(&preprocess_ctx, NULL);
    if (preprocess_err != ESP_OK) {
        ESP_LOGE(TAG, "preprocess init failed: %s", esp_err_to_name(preprocess_err));
        return;
    }

    // 센서 초기화 시도 및 준비될 때까지 대기
    wait_for_sensor_ready();
    TickType_t last_wake_time = xTaskGetTickCount();

    // 메인 루프: 센서 데이터를 주기적으로 읽어서 출력
    while (1) {
        sensor_data_t sensor_data = {0};
        esp_err_t err = sensors_read_all(&sensor_data);
        preprocess_result_t preprocess_result = {0};
        preprocess_err = preprocess_update(&preprocess_ctx, &sensor_data, err, get_uptime_ms(),
                                           &preprocess_result);
        if (preprocess_err != ESP_OK) {
            ESP_LOGE(TAG, "preprocess update failed: %s", esp_err_to_name(preprocess_err));
        }

        // 전처리 이상이 없어서 이후 diagnosis 단계에서 Lmatch/Lgrad/Lsafety 계산에 사용할 수 있는지 확인
        if (preprocess_err == ESP_OK && preprocess_result.usable_for_diagnosis) {
            consecutive_read_failures = 0;
            print_preprocessed_data(&preprocess_result);
        } else {
            if (preprocess_err == ESP_OK) {
                log_preprocess_flags(&preprocess_result);
            }

            if (err == ESP_OK && !preprocess_result.has_sensor_response_failure) {
                consecutive_read_failures = 0;
            } else {
                consecutive_read_failures++;
                ESP_LOGW(TAG, "sensor read failed: %s", esp_err_to_name(err));
            }

            // 실패가 일정 횟수 이상 연속되면 센서 재초기화 시도
            if (err == ESP_ERR_INVALID_STATE || consecutive_read_failures >= SENSOR_RECOVERY_THRESHOLD) {
                ESP_LOGW(TAG, "reinitializing sensors after %u consecutive failures",
                         consecutive_read_failures);
                sensors_deinit();
                wait_for_sensor_ready();
                preprocess_init(&preprocess_ctx, NULL);
                consecutive_read_failures = 0;
                last_wake_time = xTaskGetTickCount();
            }
        }

        // 다음 30초 주기까지 대기
        vTaskDelayUntil(&last_wake_time, pdMS_TO_TICKS(SENSOR_READ_INTERVAL_MS));
    }
}
