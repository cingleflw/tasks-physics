// Обмен данными с сервером (server.js).
// Этот файл подключают обе страницы — тест (index.html и main.js) и конструктор
// (constructor.html и constructor.js), поэтому отправка запросов записана один раз.
// Файл подключается раньше main.js и constructor.js, и они могут вызывать sendRequest.

// Подсказка на случай, если связаться с сервером не удалось
const SERVER_HINT = "Нет связи с сервером. Запустите его командой node server.js " +
    "и откройте страницу по адресу http://localhost:8000 (см. раздел «Запуск» в README.md).";

// Отправляет запрос серверу и возвращает ответ сервера — объект из JSON.
// Без data это GET-запрос — только получить данные (например, список тем),
// с data — POST-запрос: объект data отправляется на сервер в формате JSON.
// Запрос к серверу занимает время, поэтому функция асинхронная (async):
// await ждет ответа, не замораживая страницу.
// Адрес относительный ("./api/tasks"): запрос уходит на тот же сервер, с которого открыта страница
async function sendRequest(url, data) {
    // Настройки запроса. Пустые настройки означают GET-запрос
    const options = {};
    if (data !== undefined) {
        options.method = 'POST';                                  // POST — отправляем данные на сервер
        options.headers = { 'Content-Type': 'application/json' }; // Сообщаем, что данные в формате JSON
        options.body = JSON.stringify(data);                      // Превращаем объект в текст JSON
    }

    let response;
    let result;

    // Сюда попадают ошибки связи: сервер не запущен, страница открыта двойным кликом
    // (адрес file://) или открыта с другого сервера, который отвечает не в формате JSON
    // (например, встроенный сервер WebStorm)
    try {
        response = await fetch(url, options);
        result = await response.json(); // Превращаем текст ответа обратно в объект
    } catch (error) {
        console.error(error);
        throw new Error(SERVER_HINT); // throw передает ошибку дальше — тому, кто вызвал sendRequest
    }

    // response.ok равно false, если сервер ответил ошибкой (например, 404 — задача не найдена).
    // Текст ошибки сервер присылает в поле error, а код ответа запоминаем в error.status:
    // по нему checkAnswers в main.js отличит «введено не число» (код 400) от остальных ошибок
    if (!response.ok) {
        const error = new Error(result.error ?? SERVER_HINT);
        error.status = response.status;
        throw error;
    }
    return result;
}
