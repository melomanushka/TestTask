const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// Подключение к PostgreSQL
const sequelize = new Sequelize({
  dialect: 'postgres',
  database: 'sort_db',
  username: 'postgres',
  password: 'i_L0ve_y_3000',
  host: 'localhost',
  port: 5432,
  logging: false // Отключаем логирование SQL запросов
});

// Модель для сессий сортировки
const Session = sequelize.define('Session', {
  sessionId: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    unique: true,
    allowNull: false
  },
  originalArray: {
    type: DataTypes.ARRAY(DataTypes.INTEGER),
    allowNull: false
  },
  sortedArray: {
    type: DataTypes.ARRAY(DataTypes.INTEGER),
    allowNull: false
  },
  totalSteps: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
});

// Модель для шагов сортировки
const Step = sequelize.define('Step', {
  sessionId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: Session,
      key: 'sessionId'
    }
  },
  stepNumber: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  arrayState: {
    type: DataTypes.ARRAY(DataTypes.INTEGER),
    allowNull: false
  }
});

// Связи между моделями
Session.hasMany(Step, { foreignKey: 'sessionId', sourceKey: 'sessionId' });
Step.belongsTo(Session, { foreignKey: 'sessionId', targetKey: 'sessionId' });

const app = express();
app.use(cors());
app.use(express.json());

// Функция сортировки пузырьком с сохранением шагов
function bubbleSort(arr) {
  const steps = [];
  const sortedArray = [...arr]; // Создаем копию массива
  
  // Добавляем начальное состояние
  steps.push([...sortedArray]);
  
  for (let i = 0; i < sortedArray.length - 1; i++) {
    for (let j = 0; j < sortedArray.length - 1 - i; j++) {
      if (sortedArray[j] > sortedArray[j + 1]) {
        // Меняем местами элементы
        [sortedArray[j], sortedArray[j + 1]] = [sortedArray[j + 1], sortedArray[j]];
        // Сохраняем текущее состояние массива
        steps.push([...sortedArray]);
      }
    }
  }
  
  return { steps, sortedArray };
}

// Маршрут для сортировки массива
app.post('/sort', async (req, res) => {
  try {
    const { numbers } = req.body;
    
    if (!numbers || !Array.isArray(numbers)) {
      return res.status(400).json({ error: 'Требуется массив чисел' });
    }
    
    // Проверяем, что все элементы являются числами
    if (!numbers.every(num => typeof num === 'number' && !isNaN(num))) {
      return res.status(400).json({ error: 'Все элементы должны быть числами' });
    }
    
    // Выполняем сортировку
    const { steps, sortedArray } = bubbleSort(numbers);
    const sessionId = uuidv4();
    
    // Сохраняем сессию в БД
    await Session.create({
      sessionId,
      originalArray: numbers,
      sortedArray,
      totalSteps: steps.length - 1 // Вычитаем начальное состояние
    });
    
    // Сохраняем шаги в БД
    const stepRecords = steps.map((arrayState, index) => ({
      sessionId,
      stepNumber: index,
      arrayState
    }));
    
    await Step.bulkCreate(stepRecords);
    
    res.json({
      sessionId,
      steps: steps.length - 1,
      finalArray: sortedArray,
      message: 'Сортировка выполнена успешно'
    });
    
  } catch (error) {
    console.error('Ошибка при сортировке:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Маршрут для получения результата по ID сессии
app.get('/sort/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await Session.findOne({
      where: { sessionId }
    });
    
    if (!session) {
      return res.status(404).json({ error: 'Сессия не найдена' });
    }
    
    res.json({
      sessionId: session.sessionId,
      originalArray: session.originalArray,
      sortedArray: session.sortedArray,
      totalSteps: session.totalSteps
    });
    
  } catch (error) {
    console.error('Ошибка при получении результата:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Маршрут для получения всех шагов сортировки
app.get('/sort/:sessionId/steps', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Проверяем существование сессии
    const session = await Session.findOne({
      where: { sessionId }
    });
    
    if (!session) {
      return res.status(404).json({ error: 'Сессия не найдена' });
    }
    
    // Получаем все шаги сортировки
    const steps = await Step.findAll({
      where: { sessionId },
      order: [['stepNumber', 'ASC']]
    });
    
    const formattedSteps = steps.map(step => ({
      step: step.stepNumber,
      array: step.arrayState
    }));
    
    res.json(formattedSteps);
    
  } catch (error) {
    console.error('Ошибка при получении шагов:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Маршрут для получения всех сессий (дополнительный)
app.get('/sessions', async (req, res) => {
  try {
    const sessions = await Session.findAll({
      order: [['createdAt', 'DESC']],
      limit: 50 // Ограничиваем количество результатов
    });
    
    res.json(sessions);
    
  } catch (error) {
    console.error('Ошибка при получении сессий:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Обработка ошибок подключения к БД
sequelize.authenticate()
  .then(() => {
    console.log('Подключение к базе данных установлено успешно');
  })
  .catch(err => {
    console.error('Не удалось подключиться к базе данных:', err);
  });

// Запуск сервера
sequelize.sync({ alter: true })
  .then(() => {
    app.listen(5050, () => {
      console.log('Сервер запущен на порту 5050');
      console.log('API доступно по адресу: http://localhost:5050');
    });
  })
  .catch(err => {
    console.error('Ошибка при синхронизации с базой данных:', err);
  });