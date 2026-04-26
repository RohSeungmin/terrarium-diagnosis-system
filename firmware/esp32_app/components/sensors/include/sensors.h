#ifndef SENSORS_H
#define SENSORS_H

#include <stdbool.h>
#include "esp_err.h"

typedef struct {
    float hot_surface_temp_c;
    float hot_air_temp_c;
    float cool_air_temp_c;
    int light_level;
    
    bool hot_surface_ok;
    bool hot_air_ok;
    bool cool_air_ok;
    bool light_ok;
} sensor_data_t;

// 외부에서 사용 할 sensors.c 함수
esp_err_t sensors_init(void); // 센서 초기화 함수
esp_err_t sensors_deinit(void); // 센서 정리 함수
esp_err_t sensors_read_all(sensor_data_t *out_data); // 모든 센서에서 데이터를 읽어와서 sensor_data_t 구조체에 저장하는 함수

#endif
