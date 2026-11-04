/*
 * 網站設定。
 *
 * APPS_SCRIPT_URL：把 apps-script/Code.gs 部署成「網頁應用程式」後拿到的網址（以 /exec 結尾）。
 * 留空的話，網站會進入「示範模式」，資料只存在這台瀏覽器，方便先看畫面。
 * 這個網址不是密碼；真正的密碼只存在 Apps Script 的「指令碼屬性」裡。
 *
 * CURRENCY：幣別代碼（EUR、TWD⋯⋯）。
 */
window.APP_CONFIG = {
  APPS_SCRIPT_URL: '',
  CURRENCY: 'EUR'
};
