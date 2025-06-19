const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// Session model
const Session = sequelize.define('Session', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  sessionId: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    unique: true,
    allowNull: false,
    index: true
  },
  originalArray: {
    type: DataTypes.ARRAY(DataTypes.INTEGER),
    allowNull: false,
    validate: {
      notEmpty: true,
      isValidArray(value) {
        if (!Array.isArray(value)) {
          throw new Error('originalArray must be an array');
        }
        if (value.length === 0) {
          throw new Error('originalArray cannot be empty');
        }
        if (value.length > parseInt(process.env.MAX_ARRAY_SIZE) || 1000) {
          throw new Error(`Array size cannot exceed ${process.env.MAX_ARRAY_SIZE || 1000}`);
        }
      }
    }
  },
  sortedArray: {
    type: DataTypes.ARRAY(DataTypes.INTEGER),
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  totalSteps: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 0
    }
  },
  algorithmType: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'bubble',
    validate: {
      isIn: [['bubble', 'quick', 'merge', 'selection', 'insertion']]
    }
  },
  executionTime: {
    type: DataTypes.INTEGER, // in milliseconds
    allowNull: true
  },
  clientInfo: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  }
}, {
  tableName: 'sessions',
  indexes: [
    {
      fields: ['sessionId']
    },
    {
      fields: ['createdAt']
    },
    {
      fields: ['algorithmType']
    }
  ],
  hooks: {
    beforeCreate: (session, options) => {
      // Validate array sizes match
      if (session.originalArray.length !== session.sortedArray.length) {
        throw new Error('Original and sorted arrays must have the same length');
      }
    }
  }
});

// Step model
const Step = sequelize.define('Step', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  sessionId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: Session,
      key: 'sessionId'
    },
    index: true
  },
  stepNumber: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 0
    }
  },
  arrayState: {
    type: DataTypes.ARRAY(DataTypes.INTEGER),
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  swapIndices: {
    type: DataTypes.ARRAY(DataTypes.INTEGER),
    allowNull: true,
    validate: {
      isValidSwapIndices(value) {
        if (value && (!Array.isArray(value) || value.length !== 2)) {
          throw new Error('swapIndices must be an array of exactly 2 integers');
        }
      }
    }
  },
  comparisonCount: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  }
}, {
  tableName: 'steps',
  indexes: [
    {
      fields: ['sessionId', 'stepNumber']
    }
  ]
});

// Algorithm Performance model (for analytics)
const AlgorithmPerformance = sequelize.define('AlgorithmPerformance', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  algorithmType: {
    type: DataTypes.STRING,
    allowNull: false
  },
  arraySize: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  executionTime: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  stepCount: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'algorithm_performance',
  indexes: [
    {
      fields: ['algorithmType', 'arraySize']
    },
    {
      fields: ['date']
    }
  ]
});

// Associations
Session.hasMany(Step, { 
  foreignKey: 'sessionId', 
  sourceKey: 'sessionId',
  as: 'steps',
  onDelete: 'CASCADE'
});

Step.belongsTo(Session, { 
  foreignKey: 'sessionId', 
  targetKey: 'sessionId',
  as: 'session'
});

// Class methods for Session
Session.findBySessionId = function(sessionId) {
  return this.findOne({
    where: { sessionId },
    include: [{
      model: Step,
      as: 'steps',
      order: [['stepNumber', 'ASC']]
    }]
  });
};

Session.findWithPagination = function(page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'DESC') {
  const offset = (page - 1) * limit;
  
  return this.findAndCountAll({
    limit,
    offset,
    order: [[sortBy, sortOrder]],
    attributes: ['sessionId', 'totalSteps', 'algorithmType', 'executionTime', 'createdAt']
  });
};

Session.cleanupOldSessions = async function(hoursOld = 24) {
  const cutoffDate = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
  
  const result = await this.destroy({
    where: {
      createdAt: {
        [sequelize.Op.lt]: cutoffDate
      }
    }
  });
  
  return result;
};

module.exports = {
  Session,
  Step,
  AlgorithmPerformance,
  sequelize
};