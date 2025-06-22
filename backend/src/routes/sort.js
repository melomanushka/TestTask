const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { Session, Step, AlgorithmPerformance } = require('../models');
const SortingAlgorithms = require('../utils/sortingAlgorithms');
const { validate, schemas, validateArrayElements } = require('../middleware/validation');
const { sortLimiter, readLimiter } = require('../middleware/rateLimiter');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const logger = require('../config/logger');

const router = express.Router();

router.post('/', 
  sortLimiter,
  validate(schemas.sortArray),
  validateArrayElements,
  asyncHandler(async (req, res) => {
    const { numbers, algorithm = 'bubble' } = req.body;
    const clientInfo = {
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      timestamp: new Date().toISOString()
    };

    const sortResult = SortingAlgorithms.sort(numbers, algorithm);
    const sessionId = uuidv4();

    const session = await Session.create({
      sessionId,
      originalArray: numbers,
      sortedArray: sortResult.sortedArray,
      totalSteps: sortResult.steps.length - 1, 
      algorithmType: sortResult.algorithmType,
      executionTime: sortResult.executionTime,
      clientInfo
    });

    const stepRecords = sortResult.steps.map((step, index) => ({
      sessionId,
      stepNumber: index,
      arrayState: step.array,
      swapIndices: step.swapIndices,
      comparisonCount: step.comparisonCount
    }));

    await Step.bulkCreate(stepRecords);

    await AlgorithmPerformance.create({
      algorithmType: sortResult.algorithmType,
      arraySize: numbers.length,
      executionTime: sortResult.executionTime,
      stepCount: sortResult.steps.length - 1
    });

    const complexity = SortingAlgorithms.getAlgorithmComplexity(algorithm, numbers.length);

    res.status(201).json({
      sessionId,
      algorithm: sortResult.algorithmType,
      steps: sortResult.steps.length - 1,
      finalArray: sortResult.sortedArray,
      executionTime: sortResult.executionTime,
      totalComparisons: sortResult.totalComparisons,
      complexity,
      message: `Сортировка ${algorithm} выполнена успешно`
    });
  })
);

router.get('/:sessionId',
  readLimiter,
  validate(schemas.sessionId, 'params'),
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    const session = await Session.findOne({
      where: { sessionId },
      attributes: ['sessionId', 'originalArray', 'sortedArray', 'totalSteps', 'algorithmType', 'executionTime', 'createdAt']
    });

    if (!session) {
      throw new AppError('Сессия не найдена', 404);
    }

    const complexity = SortingAlgorithms.getAlgorithmComplexity(session.algorithmType, session.originalArray.length);

    res.json({
      sessionId: session.sessionId,
      originalArray: session.originalArray,
      sortedArray: session.sortedArray,
      totalSteps: session.totalSteps,
      algorithm: session.algorithmType,
      executionTime: session.executionTime,
      complexity,
      createdAt: session.createdAt
    });
  })
);

router.get('/:sessionId/steps',
  readLimiter,
  validate(schemas.sessionId, 'params'),
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { page = 1, limit = 100 } = req.query;

    const session = await Session.findOne({
      where: { sessionId },
      attributes: ['sessionId', 'totalSteps', 'algorithmType']
    });

    if (!session) {
      throw new AppError('Сессия не найдена', 404);
    }

    const offset = (page - 1) * limit;
    const steps = await Step.findAndCountAll({
      where: { sessionId },
      order: [['stepNumber', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      attributes: ['stepNumber', 'arrayState', 'swapIndices', 'comparisonCount']
    });

    const formattedSteps = steps.rows.map(step => ({
      step: step.stepNumber,
      array: step.arrayState,
      swapIndices: step.swapIndices,
      comparisonCount: step.comparisonCount
    }));

    res.json({
      sessionId,
      algorithm: session.algorithmType,
      totalSteps: session.totalSteps,
      steps: formattedSteps,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: steps.count,
        pages: Math.ceil(steps.count / limit)
      }
    });
  })
);

router.get('/:sessionId/compare',
  readLimiter,
  validate(schemas.sessionId, 'params'),
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { algorithms = 'bubble,quick,selection,insertion' } = req.query;

    const session = await Session.findOne({
      where: { sessionId },
      attributes: ['originalArray', 'algorithmType']
    });

    if (!session) {
      throw new AppError('Сессия не найдена', 404);
    }

    const algorithmList = algorithms.split(',').map(a => a.trim().toLowerCase());
    const comparisons = {};

    for (const algorithm of algorithmList) {
      try {
        const result = SortingAlgorithms.sort(session.originalArray, algorithm);
        const complexity = SortingAlgorithms.getAlgorithmComplexity(algorithm, session.originalArray.length);
        
        comparisons[algorithm] = {
          executionTime: result.executionTime,
          steps: result.steps.length - 1,
          comparisons: result.totalComparisons,
          complexity
        };
      } catch (error) {
        logger.warn(`Failed to run algorithm ${algorithm}:`, error.message);
        comparisons[algorithm] = {
          error: error.message
        };
      }
    }

    res.json({
      sessionId,
      originalArray: session.originalArray,
      arraySize: session.originalArray.length,
      comparisons
    });
  })
);

module.exports = router;