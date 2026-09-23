package com.cathouse;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@MapperScan("com.cathouse.mapper")
public class CatHouseApplication {
    public static void main(String[] args) {
        SpringApplication.run(CatHouseApplication.class, args);
    }
}
