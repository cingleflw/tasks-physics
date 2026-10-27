document.addEventListener('DOMContentLoaded', () => {
    
    // Находим все кнопки, у которых есть класс 'topic-btn'
    const buttons = document.querySelectorAll('.topic-btn');

    // Проходимся циклом по каждой найденной кнопке
    buttons.forEach(button => {
        // Проверка события клика
        button.addEventListener('click', (event) => {
            
            // event.target — это именно та кнопка, по которой кликнули.
            // data-topic берет значение из HTML-атрибута data-topic (например, "7_mechanics")
            const topicId = event.target.dataset.topic; 
            
            // textContent берет текст, написанный внутри кнопки (например, "Механическое движение")
            const topicName = event.target.textContent;

            // Спрашиваем у пользователя, сколько задач он хочет решить.
            let count = prompt(`Тема: "${topicName}".\nСколько задач решить?`, "");
            
            // Если пользователь нажал "Отмена" (вернется null) или ничего не ввел, прерываем выполнение
            if (count === null || count === "") return;
            
            // Преобразуем введенную строку в целое число
            count = parseInt(count);
            
            if (isNaN(count) || count <= 0) {
                alert("Введите положительное число.");
                return;
            }

            // Если все проверки пройдены, запускаем тест
            startTest(topicId, count);
        });
    });

    // Функция генерации задач
    // Принимает ID темы и количество задач
    function startTest(topicId, count) {
        const pool = TASKS[topicId]; // Берем массив задач для выбранной темы из tasks.js
        const generatedTasks = [];   // Создаем пустой массив для сгенерированных задач

        // Цикл: генерируем столько задач, сколько попросил пользователь
        for (let i = 0; i < count; i++) {
            // Выбираем случайную задачу из массива pool.
            // Math.random() дает число от 0 до 1. Умножаем на длину массива и округляем вниз.
            const randomTask = pool[Math.floor(Math.random() * pool.length)];
            
            // Вызываем функцию generate() у выбранной задачи. 
            const data = randomTask.generate();
            
            // Формируем объект готовой задачи и кладем его в массив generatedTasks
            generatedTasks.push({
                text: randomTask.text(data),         // Вызываем функцию text(), передаем туда числа, получаем строку
                answer: randomTask.getAnswer(data),  // Вызываем функцию getAnswer(), получаем правильный ответ
                unit: randomTask.unit                // Записываем единицу измерения
            });
        }
        
        console.log(`Сгенерировано ${count} задач по теме "${topicId}":`);
        
        // Проходимся по сгенерированным задачам и выводим их в консоль
        generatedTasks.forEach((task, index) => {
            console.log(`${index + 1}. ${task.text} (Ответ: ${task.answer} ${task.unit})`);
        });
    }
});