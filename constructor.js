// Конструктор тем и задач (страница constructor.html).
// Учитель заполняет формы, а проверяет все сервер (server.js и validator.js):
// он показывает примеры задач по шаблону и сохраняет шаблон в файл темы tasks/<id>.json.
// Функция sendRequest (запрос к серверу) — из файла api.js: он подключается раньше этого файла.

// Имя величины: латинская буква, затем латинские буквы, цифры и _ (v, t1, material).
// То же правило проверяет сервер (validator.js)
const NAME_PATTERN = /^[A-Za-z]\w*$/;

document.addEventListener('DOMContentLoaded', () => {
    // Назначаем кнопкам их действия
    document.getElementById('create-topic').addEventListener('click', createTopic);
    document.getElementById('add-param').addEventListener('click', addParamRow);
    document.getElementById('preview-task').addEventListener('click', previewTask);
    document.getElementById('save-task').addEventListener('click', saveTask);

    addParamRow();   // Одна строка параметра есть сразу
    loadTopicList(); // Список тем для формы задачи
});

// ===== Запросы к серверу =====

// Загружает темы в выпадающий список «Тема».
// selectedId — какую тему выбрать после загрузки (например, только что созданную)
async function loadTopicList(selectedId) {
    const select = document.getElementById('task-topic');

    try {
        // Сервер присылает { topics: [ { id, grade, title, count }, ... ] }
        const result = await sendRequest('./api/topics');

        select.textContent = ''; // Убираем старые пункты списка
        for (const topic of result.topics) {
            const option = addElement(select, 'option', `${topic.title} (${topic.grade} класс), задач: ${topic.count}`);
            option.value = topic.id; // Что вернет select.value, если выбран этот пункт
        }

        if (selectedId !== undefined) {
            select.value = selectedId;
        }
    } catch (error) {
        showMessage('task-message', `Не удалось загрузить список тем. ${error.message}`, true);
    }
}

// Кнопка «Создать тему»: отправляет на сервер данные формы «Новая тема»
async function createTopic() {
    const button = document.getElementById('create-topic');
    const topic = {
        id: document.getElementById('topic-id').value.trim(),
        grade: Number(document.getElementById('topic-grade').value),
        title: document.getElementById('topic-title').value.trim()
    };

    // Пока сервер создает тему, кнопка выключена: при двойном щелчке второй запрос
    // получил бы ответ «тема уже есть», и сообщение об ошибке закрыло бы сообщение об успехе
    button.disabled = true;

    // Ошибку (например, «Тема ... уже есть») сервер присылает с понятным текстом —
    // sendRequest бросает ее, а catch показывает
    try {
        const created = await sendRequest('./api/topics', topic);
        showMessage('topic-message', `Тема «${created.title}» создана: файл tasks/${created.id}.json. Теперь добавьте в нее задачи.`, false);

        // Обновляем список тем в форме задачи и сразу выбираем новую тему
        await loadTopicList(created.id);
    } catch (error) {
        showMessage('topic-message', error.message, true);
    } finally {
        // finally выполняется в любом случае — и после успеха, и после ошибки
        button.disabled = false;
    }
}

// Кнопка «Предпросмотр»: сервер проверяет шаблон и присылает примеры задач
async function previewTask() {
    document.getElementById('preview').textContent = ''; // Убираем прошлый предпросмотр

    try {
        // buildTemplate бросает ошибку, если форма заполнена неверно, — она тоже попадет в catch
        const template = buildTemplate(readTaskForm());
        const result = await sendRequest('./api/preview', { task: template });

        showMessage('task-message', 'Шаблон в порядке. Примеры задач — ниже.', false);
        showPreview(result);
    } catch (error) {
        showMessage('task-message', error.message, true);
    }
}

// Кнопка «Сохранить задачу»: сервер еще раз проверяет шаблон и дописывает его в файл темы
async function saveTask() {
    const button = document.getElementById('save-task');
    const topicId = document.getElementById('task-topic').value;

    // Пока сервер сохраняет задачу, кнопка выключена: двойной щелчок не сохранит задачу дважды
    button.disabled = true;
    // Старый предпросмотр убираем: форму могли изменить после него
    document.getElementById('preview').textContent = '';

    try {
        const template = buildTemplate(readTaskForm());
        const result = await sendRequest('./api/templates', { topicId: topicId, task: template });

        showMessage('task-message', `Задача № ${result.id} сохранена в файл tasks/${topicId}.json. Задач в теме: ${result.count}.`, false);

        // Обновляем список тем: у темы изменилось количество задач.
        // Форму не очищаем — так удобно добавить похожую задачу
        await loadTopicList(topicId);
    } catch (error) {
        showMessage('task-message', error.message, true);
    } finally {
        // finally выполняется в любом случае — и после успеха, и после ошибки
        button.disabled = false;
    }
}

// ===== Страница =====

// Создает элемент tag (например, 'p') с текстом text и добавляет его в конец элемента parent.
// textContent вставляет текст как есть: знаки < и > в тексте учителя не станут HTML-тегами
function addElement(parent, tag, text) {
    const element = document.createElement(tag);
    element.textContent = text;
    parent.append(element);
    return element;
}

// Показывает сообщение под формой: обычное или об ошибке (красным, класс error из constructor.html)
function showMessage(id, text, isError) {
    const element = document.getElementById(id);
    element.textContent = text;
    element.className = isError ? 'error' : '';
}

// Кнопка «Добавить параметр»: добавляет в форму задачи строку параметра —
// копию образца <template id="param-row"> из constructor.html
function addParamRow() {
    // content — содержимое образца; cloneNode(true) копирует элемент вместе со всем, что внутри
    const row = document.getElementById('param-row').content.firstElementChild.cloneNode(true);

    // При смене вида параметра показываем нужные поля, а остальные прячем (hidden)
    const kind = row.querySelector('.param-kind');
    kind.addEventListener('change', () => {
        row.querySelector('.param-range').hidden = kind.value !== 'range';
        row.querySelector('.param-choices').hidden = kind.value !== 'choices';
    });

    document.getElementById('params').append(row);
}

// Читает форму задачи. Все значения — строки, как их ввел учитель;
// превращает их в шаблон функция buildTemplate
function readTaskForm() {
    const params = [];
    // querySelectorAll находит все строки параметров внутри блока params
    for (const row of document.querySelectorAll('#params .param-row')) {
        params.push({
            name: row.querySelector('.param-name').value,
            kind: row.querySelector('.param-kind').value, // "range" или "choices"
            min: row.querySelector('.param-min').value,
            max: row.querySelector('.param-max').value,
            step: row.querySelector('.param-step').value,
            variants: row.querySelector('.param-variants').value
        });
    }

    return {
        text: document.getElementById('task-text').value,
        params: params,
        derived: document.getElementById('task-derived').value,
        answer: document.getElementById('task-answer').value,
        unit: document.getElementById('task-unit').value,
        precision: document.getElementById('task-precision').value // "" — по умолчанию
    };
}

// Показывает результат предпросмотра: предупреждения, примеры задач и сам шаблон
function showPreview(result) {
    const preview = document.getElementById('preview');
    // Убираем прежнее содержимое: при двойном щелчке по «Предпросмотру»
    // второй ответ сервера иначе добавился бы ниже первого
    preview.textContent = '';

    // Предупреждения сохранению не мешают, но на них стоит посмотреть
    for (const warning of result.warnings) {
        addElement(preview, 'p', `Внимание: ${warning}`).className = 'warning';
    }

    addElement(preview, 'h3', 'Примеры задач');
    const list = addElement(preview, 'ol', ''); // ol — нумерованный список
    for (const example of result.examples) {
        const item = addElement(list, 'li', example.text);
        addElement(item, 'div', `Ответ: ${example.answer} ${result.template.unit}`);
    }

    // Шаблон в формате файлов tasks/*.json: эти поля будут сохранены в файл темы,
    // если форму больше не менять (номер id добавит сервер при сохранении)
    addElement(preview, 'h3', 'Шаблон задачи');
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
    const value = text.trim();
    if (!/^-?(\d+|\d{1,3}(\s\d{3})+)([.,]\d+)?$/.test(value)) return null;
    return Number(value.replace(/\s/g, '').replace(',', '.'));
}

// Формула из поля формы: в JavaScript дробь пишется через точку, поэтому
// десятичную запятую между цифрами заменяем точкой: "m * 9,8" → "m * 9.8"
function parseFormula(text) {
    return text.trim().replace(/(\d),(\d)/g, '$1.$2');
}

// Один вариант параметра — строка из поля «Варианты»:
//   "0,5"                 → число 0.5
//   "name: меди; ro: 8,9" → { name: "меди", ro: 8.9 } — поля через «;», имя и значение через «:»
function parseVariant(line, paramName) {
    if (!line.includes(':')) {
        const number = parseNumber(line);
        if (number === null) {
            throw new Error(`Параметр «${paramName}»: вариант «${line}» — не число. `
                + 'Запишите число (0,5) или набор полей (name: меди; ro: 8,9)');
        }
        return number;
    }

    const variant = {};
    for (const part of line.split(';')) {
        if (part.trim() === '') continue; // Лишняя «;» в конце строки

        // indexOf находит первое двоеточие: слева от него имя поля, справа — значение
        const colon = part.indexOf(':');
        const field = part.slice(0, colon).trim();
        if (colon === -1 || !NAME_PATTERN.test(field)) {
            throw new Error(`Параметр «${paramName}»: в варианте «${line}» каждое поле записывается `
                + 'как «имя: значение», имя — латинскими буквами');
        }

        // Значение — число, если записано числом, иначе текст (например, "меди")
        const value = part.slice(colon + 1).trim();
        const number = parseNumber(value);
        variant[field] = number === null ? value : number;
    }
    return variant;
}

// Все варианты из поля «Варианты»: по одному в строке, пустые строки пропускаются
function parseVariants(text, paramName) {
    const variants = [];
    for (const line of text.split('\n')) {
        if (line.trim() !== '') {
            variants.push(parseVariant(line.trim(), paramName));
        }
    }
    return variants;
}

// Вычисляемые величины из поля «Вычисляемые величины»: по одной в строке, "F = p * S".
// Возвращает список [ { name: "F", formula: "p * S" }, ... ] в том же порядке
function parseDerived(text) {
    const derived = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '') continue;

        const equals = line.indexOf('=');
        if (equals === -1) {
            throw new Error(`Вычисляемые величины, строка ${i + 1}: запишите «имя = формула», например F = p * S`);
        }
        derived.push({ name: line.slice(0, equals).trim(), formula: parseFormula(line.slice(equals + 1)) });
    }
    return derived;
}

// Проверяет имя величины из формы и запоминает его в names (Set — набор без повторов):
// одно имя не может быть у двух величин
function useName(name, names) {
    if (name === '') {
        throw new Error('Укажите имя величины');
    }
    if (!NAME_PATTERN.test(name)) {
        throw new Error(`Имя «${name}» не подходит: начните с латинской буквы, дальше — латинские буквы, цифры и _`);
    }
    if (names.has(name)) {
        throw new Error(`Имя «${name}» встречается дважды`);
    }
    names.add(name);
}

// Превращает значения формы (строки из readTaskForm) в шаблон задачи —
// в том же формате и с тем же порядком полей, что в файлах tasks/*.json.
// Бросает ошибку, если по форме шаблон не составить. Остальное проверит сервер
function buildTemplate(form) {
    const template = { text: form.text.trim(), params: {} };
    const names = new Set(); // Имена всех величин задачи

    for (const row of form.params) {
        // Совсем пустую строку параметра пропускаем
        const fields = [row.name, row.min, row.max, row.step, row.variants];
        if (fields.every((field) => field.trim() === '')) continue;

        const name = row.name.trim();
        useName(name, names);

        if (row.kind === 'choices') {
            template.params[name] = { choices: parseVariants(row.variants, name) };
            continue;
        }

        const range = { min: parseNumber(row.min), max: parseNumber(row.max) };
        if (range.min === null || range.max === null) {
            throw new Error(`Параметр «${name}»: в полях «от» и «до» должны быть числа`);
        }
        // Шаг необязателен: пустое поле — шаг 1
        if (row.step.trim() !== '') {
            range.step = parseNumber(row.step);
            if (range.step === null) {
                throw new Error(`Параметр «${name}»: шаг должен быть числом`);
            }
        }
        template.params[name] = range;
    }

    const derived = parseDerived(form.derived);
    if (derived.length > 0) {
        template.derived = {};
        for (const item of derived) {
            useName(item.name, names);
            template.derived[item.name] = item.formula;
        }
    }

    template.answer = parseFormula(form.answer);
    template.unit = form.unit.trim();
    // Пустое значение — «2 (по умолчанию)»: тогда поля precision нет, как в файлах базы
    if (form.precision !== '') {
        template.precision = Number(form.precision);
    }
    return template;
}
