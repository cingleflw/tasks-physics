const TASKS = {
    
    "7_mechanics": [
        {
            generate: function() {
                let t, v, s;

                t = Math.floor(Math.random() * 5) + 1;   // от 1 до 5 часов
                v = Math.floor(Math.random() * 20) + 5;  // от 5 до 24 км/ч
                s = t * v;
                
                return { t: t, v: v, s: s };
            },
            
            // Функция текста: принимает данные из generate и строит строку
            text: function(data) {
                return `Велосипедист ехал ${data.t} часа со скоростью ${data.v} км/ч. Какое расстояние он проехал?`;
            },
            
            // Правильный ответ (для проверки)
            getAnswer: function(data) {
                return data.s;
            },
            
            // Единица измерения (для красивого вывода)
            unit: "км"
        },
        
        // Вторая задача для этой же темы
        {
            generate: function() {
                const v = Math.floor(Math.random() * 20) + 10; // 10-29 км/ч
                const t = Math.floor(Math.random() * 4) + 1;   // 1-4 ч
                return { v: v, t: t, s: v * t };
            },
            text: function(d) {
                return `Автомобиль движется со скоростью ${d.v} км/ч. Какой путь он пройдет за ${d.t} ч?`;
            },
            getAnswer: function(d) { return d.s; },
            unit: "км"
        }
    ],
    
    // Пример для другой темы — масса и плотность
    "6_massa": [
        {
            generate: function() {
                const ro = Math.floor(Math.random() * 10) + 1; // 1-10 г/см³
                const V = Math.floor(Math.random() * 10) + 1;  // 1-10 см³
                return { ro: ro, V: V, m: ro * V };
            },
            text: function(d) {
                return `Найдите массу тела объемом ${d.V} см³, если его плотность ${d.ro} г/см³.`;
            },
            getAnswer: function(d) { return d.m; },
            unit: "г"
        }
    ]
};