/**
 * 猫屋小程序 · 环境配置
 * ------------------------------------------------------------
 * 与后端 Spring Boot profile 对应（详见 server/src/main/resources/application-{dev,prod}.yml）：
 *   dev  —— 本地开发 / 开发者工具模拟器（后端跑在本机，连 127.0.0.1）
 *   test —— 局域网真机调试（手机真机，后端跑在开发机，连开发机局域网 IP）
 *   prod —— 线上云服务器（已备案域名 + HTTPS；微信正式发布禁止纯 IP / HTTP）
 *
 * 切换方式：修改下方 ENV 常量即可（'dev' | 'test' | 'prod'）。
 *   改完在开发者工具「编译」即生效，无需重新构建。
 *
 * 临时覆盖（免改码）：开发者工具 Storage 写入键 cathouse_api_base，
 *   其优先级高于下方配置，便于临时换 IP / 端口联调。
 *
 * 注意：fileBaseUrl 仅作与后端 file.base-url 对齐的参考；上传文件后
 *   小程序拿到的可访问 URL 由后端 UploadService 按自身配置拼出并直接返回，
 *   前端一般无需用 fileBaseUrl 自行拼地址。
 */

// 当前激活环境：dev | test | prod
const ENV = 'dev';

const ENV_CONFIG = {
  // 本地开发：后端与开发者工具同机（模拟器）
  dev: {
    label: '本地开发',
    apiBaseUrl: 'http://127.0.0.1:8787',
    fileBaseUrl: 'http://127.0.0.1:8787',
  },

  // 局域网真机调试：手机连同一 WiFi，后端跑在开发机上。
  // ⚠️ 必须填「运行后端那台机器」的局域网 IP（真机填 127.0.0.1 会指向手机自己）。
  //   当前开发机实测为 192.168.10.168；换网络 / DHCP 变化后需同步改这里，
  //   或临时在开发者工具 Storage 写 cathouse_api_base 覆盖（优先级更高）。
  test: {
    label: '局域网真机调试',
    apiBaseUrl: 'http://192.168.10.168:8787',
    fileBaseUrl: 'http://192.168.10.168:8787',
  },

  // 线上：已备案域名 + HTTPS，微信正式发布唯一合规目标
  prod: {
    label: '线上',
    apiBaseUrl: 'https://your-domain.com',
    fileBaseUrl: 'https://your-domain.com',
  },
};

const current = ENV_CONFIG[ENV] || ENV_CONFIG.dev;

module.exports = {
  ENV,
  ENV_CONFIG,
  // 当前激活环境配置（业务代码用这两个）
  apiBaseUrl: current.apiBaseUrl,
  fileBaseUrl: current.fileBaseUrl,
};
