// Конструктор тем и задач (страница constructor.html).
// Учитель заполняет формы, а проверяет все сервер (server.js и validator.js):
// он показывает примеры задач по шаблону и сохраняет шаблон в файл темы tasks/<id>.json.
// Функция sendRequest (запрос к серверу) — из файла api.js: он подключается раньше этого файла.

// Имя величины: латинская буква, затем латинские буквы, цифры и _ (v, t1, material).
// То же правило проверяет сервер (validator.js)
// Регулярное выражение (между косыми чертами /.../) — шаблон, которому должна подходить строка:
//   ^        — начало строки: до шаблона ничего быть не должно;
//   [A-Za-z] — ровно один знак из квадратных скобок: латинская буква от A до Z или от a до z;
//   \w*      — дальше сколько угодно (* — «0 или больше раз») знаков \w: латинских букв, цифр и _.
//              Русские буквы в \w не входят: имя "aб" не подойдет;
//   $        — конец строки: после шаблона тоже ничего быть не должно.
// const — постоянная: значение NAME_PATTERN в программе больше не меняется
const NAME_PATTERN = /^[A-Za-z]\w*$/;

// Код внутри фигурных скобок выполнится, когда браузер прочитает всю страницу (событие DOMContentLoaded).
// Этот файл подключен в <head> constructor.html, то есть раньше кнопок и полей формы:
// если искать их сразу, getElementById их еще не нашел бы.
// addEventListener(событие, функция) — «когда случится событие, вызови функцию»;
// () => { ... } — стрелочная функция: короткая запись функции без имени
document.addEventListener('DOMContentLoaded', () => {
    // Назначаем кнопкам их действия
    // getElementById находит элемент страницы по атрибуту id, а 'click' — щелчок по нему.
    // Имя функции пишется без скобок: мы не вызываем ее сейчас, а передаем браузеру —
    // он сам вызовет ее, когда кнопку нажмут
    document.getElementById('create-topic').addEventListener('click', createTopic); // Кнопка «Создать тему»
    document.getElementById('add-param').addEventListener('click', addParamRow);    // Кнопка «Добавить параметр»
    document.getElementById('preview-task').addEventListener('click', previewTask); // Кнопка «Предпросмотр»
    document.getElementById('save-task').addEventListener('click', saveTask);       // Кнопка «Сохранить задачу»

    // А эти функции вызываются сразу (со скобками), не дожидаясь щелчка
    addParamRow();   // Одна строка параметра есть сразу
    loadTopicList(); // Список тем для формы задачи
});

// ===== Запросы к серверу =====

// Загружает темы в выпадающий список «Тема».
// selectedId — какую тему выбрать после загрузки (например, только что созданную)
// async — асинхронная функция: внутри нее можно ждать ответа сервера (await), не замораживая страницу
async function loadTopicList(selectedId) {
    const select = document.getElementById('task-topic'); // Список «Тема» в форме «Новая задача»

    // try { ... } catch (error) { ... }: если внутри try случится ошибка (например, нет связи
    // с сервером), программа не остановится, а сразу перейдет в catch
    try {
        // Сервер присылает { topics: [ { id, grade, title, count }, ... ] }
        // await ждет ответа на GET-запрос /api/topics (см. handleTopicList в server.js)
        const result = await sendRequest('./api/topics');

        select.textContent = ''; // Убираем старые пункты списка
        // for...of перебирает список по очереди: topic — очередная тема,
        // например { id: "7_pressure", grade: 7, title: "Давление", count: 0 }
        for (const topic of result.topics) {
            // Добавляем пункт <option> с текстом «Давление (7 класс), задач: 0».
            // `...` — шаблонная строка: вместо ${topic.title} подставляется значение.
            // В отличие от главной страницы, здесь видны и темы без задач: в них и добавляют задачи
            const option = addElement(select, 'option', `${topic.title} (${topic.grade} класс), задач: ${topic.count}`);
            option.value = topic.id; // Что вернет select.value, если выбран этот пункт
        }

        // undefined — значение не передано: loadTopicList() вызвали без аргумента,
        // тогда выбранным остается первый пункт списка
        if (selectedId !== undefined) {
            select.value = selectedId; // Выбираем пункт, у которого value равно selectedId ("7_pressure")
        }
    } catch (error) {
        // error.message — текст ошибки, например подсказка SERVER_HINT из api.js.
        // Третий аргумент true — это сообщение об ошибке (см. showMessage)
        showMessage('task-message', `Не удалось загрузить список тем. ${error.message}`, true);
    }
}

// Кнопка «Создать тему»: отправляет на сервер данные формы «Новая тема»
async function createTopic() {
    const button = document.getElementById('create-topic'); // Сама кнопка «Создать тему»
    // Данные новой темы, например { id: "7_pressure", grade: 7, title: "Давление" }.
    // .value — то, что сейчас введено или выбрано в поле (всегда строка); trim() убирает пробелы по краям
    const topic = {
        id: document.getElementById('topic-id').value.trim(),        // Поле «Имя файла»
        grade: Number(document.getElementById('topic-grade').value), // Список «Класс»: строка "7" → число 7
        title: document.getElementById('topic-title').value.trim()   // Поле «Название»
    };

    // Пока сервер создает тему, кнопка выключена: при двойном щелчке второй запрос
    // получил бы ответ «тема уже есть», и сообщение об ошибке закрыло бы сообщение об успехе
    button.disabled = true; // disabled: true — кнопку нажать нельзя, false — снова можно

    // Ошибку (например, «Тема ... уже есть») сервер присылает с понятным текстом —
    // sendRequest бросает ее, а catch показывает
    try {
        // POST-запрос /api/topics (handleCreateTopic в server.js): сервер проверяет данные (checkTopic
        // в validator.js), создает файл темы без задач и отвечает { id, grade, title, count: 0 }
        const created = await sendRequest('./api/topics', topic);
        // Сообщение под формой «Новая тема»; false — обычное сообщение, не ошибка
        showMessage('topic-message', `Тема «${created.title}» создана: файл tasks/${created.id}.json. Теперь добавьте в нее задачи.`, false);

        // Обновляем список тем в форме задачи и сразу выбираем новую тему
        // await ждет, пока список загрузится: до этого кнопка остается выключенной
        await loadTopicList(created.id);
    } catch (error) {
        showMessage('topic-message', error.message, true); // Текст ошибки — под формой «Новая тема»
    } finally {
        // finally выполняется в любом случае — и после успеха, и после ошибки
        button.disabled = false; // Снова включаем кнопку
    }
}

// Кнопка «Предпросмотр»: сервер проверяет шаблон и присылает примеры задач
async function previewTask() {
    document.getElementById('preview').textContent = ''; // Убираем прошлый предпросмотр

    // Ошибку в шаблоне может найти и сервер (validator.js): как и в createTopic, sendRequest
    // бросает ее с понятным текстом от сервера, и catch показывает этот текст под формой задачи
    try {
        // buildTemplate бросает ошибку, если форма заполнена неверно, — она тоже попадет в catch
        // Сначала readTaskForm() читает строки из формы, затем buildTemplate собирает из них шаблон
        const template = buildTemplate(readTaskForm());
        // POST-запрос /api/preview (handlePreview в server.js): шаблон отправляем в поле task —
        // { task: { text, params, ... } }. Сервер отвечает { template, examples, warnings }
        const result = await sendRequest('./api/preview', { task: template });

        // false — обычное сообщение, не ошибка
        showMessage('task-message', 'Шаблон в порядке. Примеры задач — ниже.', false);
        showPreview(result); // Выводим предупреждения, примеры задач и шаблон в блок preview
    } catch (error) {
        showMessage('task-message', error.message, true); // Текст ошибки — под формой задачи, красным
    }
}

// Кнопка «Сохранить задачу»: сервер еще раз проверяет шаблон и дописывает его в файл темы
async function saveTask() {
    const button = document.getElementById('save-task');         // Сама кнопка «Сохранить задачу»
    const topicId = document.getElementById('task-topic').value; // Тема из списка «Тема», например "7_pressure"

    // Пока сервер сохраняет задачу, кнопка выключена: двойной щелчок не сохранит задачу дважды
    button.disabled = true;
    // Старый предпросмотр убираем: форму могли изменить после него
    document.getElementById('preview').textContent = '';

    // Ошибки формы и сервера попадут в catch, как в previewTask
    try {
        // Шаблон собираем заново из того, что сейчас в форме: предпросмотр перед сохранением не обязателен
        const template = buildTemplate(readTaskForm());
        // POST-запрос /api/templates (handleSaveTemplate в server.js): сервер проверяет шаблон, дописывает его
        // в файл tasks/<topicId>.json и отвечает { id, count } — номер новой задачи и сколько задач в теме
        const result = await sendRequest('./api/templates', { topicId: topicId, task: template });

        // Например: «Задача № 3 сохранена в файл tasks/7_pressure.json. Задач в теме: 3.»
        showMessage('task-message', `Задача № ${result.id} сохранена в файл tasks/${topicId}.json. Задач в теме: ${result.count}.`, false);

        // Обновляем список тем: у темы изменилось количество задач.
        // Форму не очищаем — так удобно добавить похожую задачу
        await loadTopicList(topicId);
    } catch (error) {
        showMessage('task-message', error.message, true); // Текст ошибки — под формой задачи
    } finally {
        // finally выполняется в любом случае — и после успеха, и после ошибки
        button.disabled = false; // Снова включаем кнопку
    }
}

// ===== Страница =====

// Создает элемент tag (например, 'p') с текстом text и добавляет его в конец элемента parent.
// textContent вставляет текст как есть: знаки < и > в тексте учителя не станут HTML-тегами
function addElement(parent, tag, text) {
    const element = document.createElement(tag); // Новый элемент: на странице его пока нет
    element.textContent = text;                  // Текст внутри элемента
    parent.append(element);                      // Вставляем в конец parent — теперь элемент виден
    return element;                              // Возвращаем элемент: ему можно, например, задать класс
}

// Показывает сообщение под формой: обычное или об ошибке (красным, класс error из constructor.html)
// id — в какой абзац писать: 'topic-message' (форма темы) или 'task-message' (форма задачи)
function showMessage(id, text, isError) {
    const element = document.getElementById(id); // Абзац <p id="..."> под формой
    element.textContent = text;                  // Новый текст заменяет прежнее сообщение
    // Тернарный оператор «условие ? a : b»: если isError равно true — класс 'error', иначе ''.
    // Пустая строка убирает класс, и сообщение после ошибки снова становится обычным.
    // Как выглядит класс error, задано в styles.css (правило .error)
    element.className = isError ? 'error' : '';
}

// Кнопка «Добавить параметр»: добавляет в форму задачи строку параметра —
// копию образца <template id="param-row"> из constructor.html
function addParamRow() {
    // content — содержимое образца; cloneNode(true) копирует элемент вместе со всем, что внутри
    // firstElementChild — первый элемент образца, <div class="param-row">
    // (firstChild вернул бы перенос строки перед ним: для браузера это тоже часть содержимого)
    const row = document.getElementById('param-row').content.firstElementChild.cloneNode(true);

    // При смене вида параметра показываем нужные поля, а остальные прячем (hidden)
    // querySelector находит внутри новой строки первый элемент с классом param-kind — список «Вид».
    // Ищем именно в row, а не во всей странице: строк параметров может быть несколько
    const kind = row.querySelector('.param-kind');
    // Событие change — учитель выбрал в списке «Вид» другой пункт.
    // Стрелочная функция помнит свои row и kind, поэтому каждая строка переключает только свои поля
    kind.addEventListener('change', () => {
        // kind.value !== 'range' — true, если выбран не «диапазон чисел»: тогда поля «от», «до», «шаг» прячем
        row.querySelector('.param-range').hidden = kind.value !== 'range';
        // Поле «Варианты» — наоборот: прячем, если выбран не «список вариантов»
        row.querySelector('.param-choices').hidden = kind.value !== 'choices';
    });

    document.getElementById('params').append(row); // Добавляем строку в конец блока <div id="params">
}

// Читает форму задачи. Все значения — строки, как их ввел учитель;
// превращает их в шаблон функция buildTemplate
function readTaskForm() {
    const params = []; // Строки параметров, пока список пустой
    // querySelectorAll находит все строки параметров внутри блока params
    // ('#params .param-row' — элементы с классом param-row внутри элемента с id="params")
    for (const row of document.querySelectorAll('#params .param-row')) {
        // push добавляет в конец списка значения полей одной строки: «Имя», «Вид», «от», «до», «шаг»
        // и «Варианты» (все строки поля одним текстом). Например:
        // { name: "p", kind: "range", min: "100", max: "1 000", step: "100", variants: "" }
        params.push({
            name: row.querySelector('.param-name').value,
            kind: row.querySelector('.param-kind').value, // "range" или "choices"
            min: row.querySelector('.param-min').value,
            max: row.querySelector('.param-max').value,
            step: row.querySelector('.param-step').value,
            variants: row.querySelector('.param-variants').value
        });
    }

    // Все значения формы задачи одним объектом
    return {
        text: document.getElementById('task-text').value,          // Поле «Текст условия»
        params: params,                                            // Строки параметров, собранные выше
        derived: document.getElementById('task-derived').value,    // Поле «Вычисляемые величины»
        answer: document.getElementById('task-answer').value,      // Поле «Формула ответа»
        unit: document.getElementById('task-unit').value,          // Поле «Единица измерения»
        precision: document.getElementById('task-precision').value // "" — по умолчанию
    };
}

// Показывает результат предпросмотра: предупреждения, примеры задач и сам шаблон
// result — ответ сервера на /api/preview, например
// { template: { ... }, examples: [ { text: "...", answer: "600" }, ... ], warnings: [ "..." ] }
function showPreview(result) {
    const preview = document.getElementById('preview'); // Блок <div id="preview"> под кнопками
    // Убираем прежнее содержимое: при двойном щелчке по «Предпросмотру»
    // второй ответ сервера иначе добавился бы ниже первого
    preview.textContent = '';

    // Предупреждения сохранению не мешают, но на них стоит посмотреть
    // warning — строка, например «Все пробные задачи получились одинаковыми: ...» (tryTemplate в validator.js)
    for (const warning of result.warnings) {
        // addElement возвращает новый абзац, и ему сразу задается класс warning (оформление — в styles.css)
        addElement(preview, 'p', `Внимание: ${warning}`).className = 'warning';
    }

    addElement(preview, 'h3', 'Примеры задач'); // Заголовок над примерами
    const list = addElement(preview, 'ol', ''); // ol — нумерованный список
    // Сервер присылает до трех разных примеров
    for (const example of result.examples) {
        const item = addElement(list, 'li', example.text); // Пункт списка li — текст условия
        // Под условием — ответ с единицей измерения: «Ответ: 2,5 Па».
        // Ответ сервер уже прислал строкой в русской записи: "2,5", "42 000" (formatNumber в generator.js)
        addElement(item, 'div', `Ответ: ${example.answer} ${result.template.unit}`);
    }

    // Шаблон в формате файлов tasks/*.json: эти поля будут сохранены в файл темы,
    // если форму больше не менять (номер id добавит сервер при сохранении)
    addElement(preview, 'h3', 'Шаблон задачи');
    // result.template — шаблон, уже проверенный сервером (checkTemplate в validator.js).
    // JSON.stringify превращает объект в текст JSON: null — без отбора полей, 4 — отступ в 4 пробела.
    // pre показывает текст как есть, с переносами строк и отступами. В файле темы оформление
    // немного другое (описание параметра — в одну строку, formatJSON в server.js), а поля те же
    addElement(preview, 'pre', JSON.stringify(result.template, null, 4));
}

// ===== Разбор формы =====
// Эти функции не обращаются к странице: получают строки и возвращают результат

// Число из поля формы: "2,5" → 2.5, "-3" → -3, "42 000" → 42000. Если в поле не число — null.
// Number() здесь не подходит: Number('') дает 0, а "1e3" и "Infinity" тоже считает числами.
// Регулярное выражение — шаблон текста: необязательный минус, цифры (пробел можно ставить
// только между разрядами: "42 000"), затем, может быть, запятая или точка и еще цифры.
// Поэтому "1 2" или "5, 10" — не число: скорее всего, это два варианта в одной строке
function parseNumber(text) {
    const value = text.trim(); // Без пробелов по краям: " 2,5 " → "2,5"
    // То же регулярное выражение по частям:
    //   ^ и $          — начало и конец строки: шаблону должна подходить вся строка целиком;
    //   -?             — минус или ничего (? — «0 или 1 раз»);
    //   (... | ...)    — целая часть, одна из двух записей (| — «или»):
    //     \d+               — цифры подряд без пробелов: "42000" (\d — цифра, + — «1 или больше раз»);
    //     \d{1,3}(\s\d{3})+ — от 1 до 3 цифр ({1,3} — «от 1 до 3 раз»), затем одна или несколько
    //                         групп «пробел и ровно 3 цифры»: "42 000", "1 234 567".
    //                         \s — любой пробельный знак, в том числе неразрывный пробел,
    //                         который сервер ставит в числах (formatNumber в generator.js);
    //   ([.,]\d+)?     — дробная часть или ничего: точка или запятая ([.,] — один знак из скобок) и цифры.
    // test возвращает true, если строка подходит; ! — «не». Не подойдут, например,
    // "1234 567" (первая группа длиннее 3 цифр), ".5" и "5." (нет цифр до или после), "1e3"
    if (!/^-?(\d+|\d{1,3}(\s\d{3})+)([.,]\d+)?$/.test(value)) return null;
    // replace(/\s/g, '') убирает все пробелы (g — «все совпадения, а не только первое»): "42 000" → "42000".
    // replace(',', '.') заменяет первую запятую точкой — больше одной запятой шаблон и не пропустит.
    // Теперь Number получает запись, которую понимает JavaScript: "2.5" → 2.5
    return Number(value.replace(/\s/g, '').replace(',', '.'));
}

// Формула из поля формы: в JavaScript дробь пишется через точку, поэтому
// десятичную запятую между цифрами заменяем точкой: "m * 9,8" → "m * 9.8"
function parseFormula(text) {
    // Регулярное выражение /(\d),(\d)/g — цифра, запятая, цифра; g — заменить все такие места.
    // Круглые скобки запоминают найденные цифры, а в строке замены '$1.$2' на место $1 и $2
    // встают эти цифры: "9,8" → "9.8". Остальные запятые ("a, b", "1, 2") не меняются —
    // такую формулу отклонит сервер (checkFormula в validator.js)
    return text.trim().replace(/(\d),(\d)/g, '$1.$2');
}

// Один вариант параметра — строка из поля «Варианты»:
//   "0,5"                 → число 0.5
//   "name: меди; ro: 8,9" → { name: "меди", ro: 8.9 } — поля через «;», имя и значение через «:»
// paramName — имя параметра, нужно только для текста ошибки
function parseVariant(line, paramName) {
    // includes — есть ли в строке двоеточие. Нет — значит, вариант должен быть просто числом
    if (!line.includes(':')) {
        const number = parseNumber(line); // Число или null
        if (number === null) { // parseNumber не смог прочитать число
            // throw бросает ошибку: функция сразу прерывается, а ошибку получит catch
            // в previewTask или saveTask. Длинный текст ошибки склеен из двух строк знаком +
            throw new Error(`Параметр «${paramName}»: вариант «${line}» — не число. `
                + 'Запишите число (0,5) или набор полей (name: меди; ro: 8,9)');
        }
        return number; // Вариант — число, например 0.5
    }

    // Вариант из нескольких полей — объект, сначала пустой; поля добавляются в цикле
    const variant = {};
    // split(';') разрезает строку по «;»: "name: меди; ro: 8,9" → ["name: меди", " ro: 8,9"]
    for (const part of line.split(';')) {
        // Пустую часть пропускаем: continue сразу переходит к следующей части
        if (part.trim() === '') continue; // Лишняя «;» в конце строки

        // indexOf находит первое двоеточие: слева от него имя поля, справа — значение
        const colon = part.indexOf(':'); // В "name: меди" это 4 (счет с 0); нет двоеточия — -1
        // slice(0, colon) — часть строки от начала до двоеточия (само двоеточие не входит): "name"
        const field = part.slice(0, colon).trim();
        // || — «или»: ошибка, если в части нет двоеточия или имя поля не подходит под NAME_PATTERN.
        // Без двоеточия field получился бы бессмысленным (slice(0, -1) — строка без последнего знака),
        // но он не используется: проверка colon === -1 стоит первой, и при true вторая уже не выполняется
        if (colon === -1 || !NAME_PATTERN.test(field)) {
            throw new Error(`Параметр «${paramName}»: в варианте «${line}» каждое поле записывается `
                + 'как «имя: значение», имя — латинскими буквами');
        }

        // Значение — число, если записано числом, иначе текст (например, "меди")
        // slice(colon + 1) — все после двоеточия: " меди", после trim — "меди"
        const value = part.slice(colon + 1).trim();
        const number = parseNumber(value); // Число или null, если это текст
        // variant[field] — поле объекта, имя которого хранится в переменной field: variant["ro"] = 8.9.
        // Тернарный оператор: если number равно null — записываем текст value, иначе число
        variant[field] = number === null ? value : number;
    }
    return variant; // Например { name: "меди", ro: 8.9 }
}

// Все варианты из поля «Варианты»: по одному в строке, пустые строки пропускаются
function parseVariants(text, paramName) {
    const variants = []; // Список вариантов: числа или объекты
    // split('\n') разрезает текст поля на строки по знаку переноса строки \n
    for (const line of text.split('\n')) {
        if (line.trim() !== '') { // Строка не пустая (одни пробелы тоже считаются пустой строкой)
            variants.push(parseVariant(line.trim(), paramName)); // Вариант из этой строки — в конец списка
        }
    }
    // Например [0.5, 1, 2]. Пустой список проверит сервер: «добавьте хотя бы один вариант» (validator.js)
    return variants;
}

// Вычисляемые величины из поля «Вычисляемые величины»: по одной в строке, "F = p * S".
// Возвращает список [ { name: "F", formula: "p * S" }, ... ] в том же порядке
function parseDerived(text) {
    const derived = [];             // Сюда собираем величины
    const lines = text.split('\n'); // Строки поля по отдельности
    // Обычный цикл for со счетчиком i (а не for...of): номер строки нужен для текста ошибки.
    // let — переменная, которая меняется: i++ после каждого шага увеличивает i на 1
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim(); // lines[i] — строка номер i (счет с 0)
        if (line === '') continue;    // Пустую строку пропускаем

        const equals = line.indexOf('='); // Где первый знак «=»; -1 — его нет
        if (equals === -1) {
            // Номер строки — i + 1: люди считают строки с 1, а пустые строки тоже входят в счет
            throw new Error(`Вычисляемые величины, строка ${i + 1}: запишите «имя = формула», например F = p * S`);
        }
        // Слева от «=» — имя ("F"), справа — формула ("p * S"), в которой parseFormula заменит запятые точками.
        // Пустое имя ("= p * S") здесь не проверяется — его найдет useName в buildTemplate
        derived.push({ name: line.slice(0, equals).trim(), formula: parseFormula(line.slice(equals + 1)) });
    }
    return derived;
}

// Проверяет имя величины из формы и запоминает его в names (Set — набор без повторов):
// одно имя не может быть у двух величин
// names приходит из buildTemplate: add меняет тот же самый набор, и buildTemplate видит все имена
function useName(name, names) {
    if (name === '') { // Имя не заполнено
        throw new Error('Укажите имя величины');
    }
    if (!NAME_PATTERN.test(name)) { // Имя не подходит под правило NAME_PATTERN (см. начало файла)
        throw new Error(`Имя «${name}» не подходит: начните с латинской буквы, дальше — латинские буквы, цифры и _`);
    }
    if (names.has(name)) { // has — есть ли уже такое имя в наборе
        throw new Error(`Имя «${name}» встречается дважды`);
    }
    names.add(name); // Запоминаем имя: величина с таким же именем дальше вызовет ошибку
}

// Превращает значения формы (строки из readTaskForm) в шаблон задачи —
// в том же формате и с тем же порядком полей, что в файлах tasks/*.json.
// Бросает ошибку, если по форме шаблон не составить. Остальное проверит сервер
// Например, строка параметра p (от "100", до "1 000", шаг "100"), величины "F = p * S", ответ "p"
// и единица "Па" превращаются в { text: "...", params: { p: { min: 100, max: 1000, step: 100 }, ... },
// derived: { F: "p * S" }, answer: "p", unit: "Па" }
function buildTemplate(form) {
    // Шаблон собираем по частям: сначала текст условия и пустой объект params,
    // в который ниже добавятся параметры, например params.p = { min: 100, max: 1000, step: 100 }
    const template = { text: form.text.trim(), params: {} };
    const names = new Set(); // Имена всех величин задачи

    // row — строка параметра из readTaskForm: { name, kind, min, max, step, variants }
    for (const row of form.params) {
        // Совсем пустую строку параметра пропускаем
        // Список «Вид» сюда не входит: в нем всегда что-то выбрано
        const fields = [row.name, row.min, row.max, row.step, row.variants];
        // every возвращает true, если условие верно для каждого элемента списка;
        // (field) => field.trim() === '' — стрелочная функция «поле пустое»
        if (fields.every((field) => field.trim() === '')) continue;

        const name = row.name.trim(); // Имя без пробелов по краям: " S " → "S"
        useName(name, names); // Ошибка, если имя пустое, не латинское или уже встречалось

        if (row.kind === 'choices') { // Вид «список вариантов»
            // Например params.material = { choices: [ { name: "меди", ro: 8.9 }, ... ] }.
            // Квадратные скобки: имя поля объекта берется из переменной name
            template.params[name] = { choices: parseVariants(row.variants, name) };
            continue; // Поля «от», «до», «шаг» списку вариантов не нужны — переходим к следующей строке
        }

        // Вид «диапазон чисел»: например { min: 100, max: 1000 }
        const range = { min: parseNumber(row.min), max: parseNumber(row.max) };
        if (range.min === null || range.max === null) { // Хотя бы в одном из полей не число
            throw new Error(`Параметр «${name}»: в полях «от» и «до» должны быть числа`);
        }
        // Шаг необязателен: пустое поле — шаг 1
        // Поэтому поле step добавляем, только если шаг указан: без него generator.js сам возьмет шаг 1
        if (row.step.trim() !== '') {
            range.step = parseNumber(row.step); // Новое поле объекта: { min: 100, max: 1000, step: 100 }
            if (range.step === null) { // В поле «шаг» не число
                throw new Error(`Параметр «${name}»: шаг должен быть числом`);
            }
        }
        template.params[name] = range; // Например params.p = { min: 100, max: 1000, step: 100 }
    }

    const derived = parseDerived(form.derived); // [ { name: "F", formula: "p * S" }, ... ]
    // Поле derived добавляем, только если величины есть: в файлах базы у задачи без них этого поля нет
    if (derived.length > 0) {
        template.derived = {}; // Объект «имя: формула», например { F: "p * S" }
        for (const item of derived) { // item — { name: "F", formula: "p * S" }
            // Имя величины не должно совпадать с именами параметров и других величин
            useName(item.name, names);
            // Поля объекта хранятся в порядке добавления, поэтому порядок строк из формы сохранится:
            // generator.js считает величины по очереди, и каждая может использовать предыдущие
            template.derived[item.name] = item.formula;
        }
    }

    template.answer = parseFormula(form.answer); // Формула ответа: "p", "m * 9.8"
    template.unit = form.unit.trim();            // Единица измерения: "Па"
    // Пустое значение — «2 (по умолчанию)»: тогда поля precision нет, как в файлах базы
    // Сравниваем со строкой '' до Number: Number('') дает 0, и «по умолчанию» превратилось бы в 0 знаков.
    // У остальных пунктов списка value — их текст: "0", "1", ..., "6"
    if (form.precision !== '') {
        template.precision = Number(form.precision); // "1" → 1
    }
    return template; // Готовый шаблон; поля derived и precision в нем есть, только если заданы
}
