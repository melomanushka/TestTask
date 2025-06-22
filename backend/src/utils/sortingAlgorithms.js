const logger = require('../config/logger');

class SortingAlgorithms {
  static bubbleSort(arr) {
    const startTime = Date.now();
    const steps = [];
    const sortedArray = [...arr];
    let comparisonCount = 0;
    
    steps.push({
      array: [...sortedArray],
      swapIndices: null,
      comparisonCount
    });
    
    for (let i = 0; i < sortedArray.length - 1; i++) {
      let swapped = false;
      
      for (let j = 0; j < sortedArray.length - 1 - i; j++) {
        comparisonCount++;
        
        if (sortedArray[j] > sortedArray[j + 1]) {
          [sortedArray[j], sortedArray[j + 1]] = [sortedArray[j + 1], sortedArray[j]];
          swapped = true;
          
          steps.push({
            array: [...sortedArray],
            swapIndices: [j, j + 1],
            comparisonCount
          });
        }
      }
      
      if (!swapped) break;
    }
    
    const executionTime = Date.now() - startTime;
    
    return {
      steps,
      sortedArray,
      executionTime,
      algorithmType: 'bubble',
      totalComparisons: comparisonCount
    };
  }

  static quickSort(arr) {
    const startTime = Date.now();
    const steps = [];
    const sortedArray = [...arr];
    let comparisonCount = 0;
    
    steps.push({
      array: [...sortedArray],
      swapIndices: null,
      comparisonCount
    });

    const quickSortHelper = (array, low, high) => {
      if (low < high) {
        const pivotIndex = partition(array, low, high);
        quickSortHelper(array, low, pivotIndex - 1);
        quickSortHelper(array, pivotIndex + 1, high);
      }
    };

    const partition = (array, low, high) => {
      const pivot = array[high];
      let i = low - 1;

      for (let j = low; j < high; j++) {
        comparisonCount++;
        if (array[j] < pivot) {
          i++;
          if (i !== j) {
            [array[i], array[j]] = [array[j], array[i]];
            steps.push({
              array: [...array],
              swapIndices: [i, j],
              comparisonCount
            });
          }
        }
      }

      if (i + 1 !== high) {
        [array[i + 1], array[high]] = [array[high], array[i + 1]];
        steps.push({
          array: [...array],
          swapIndices: [i + 1, high],
          comparisonCount
        });
      }

      return i + 1;
    };

    quickSortHelper(sortedArray, 0, sortedArray.length - 1);
    
    const executionTime = Date.now() - startTime;
    
    return {
      steps,
      sortedArray,
      executionTime,
      algorithmType: 'quick',
      totalComparisons: comparisonCount
    };
  }

  static selectionSort(arr) {
    const startTime = Date.now();
    const steps = [];
    const sortedArray = [...arr];
    let comparisonCount = 0;
    
    steps.push({
      array: [...sortedArray],
      swapIndices: null,
      comparisonCount
    });

    for (let i = 0; i < sortedArray.length - 1; i++) {
      let minIndex = i;
      
      for (let j = i + 1; j < sortedArray.length; j++) {
        comparisonCount++;
        if (sortedArray[j] < sortedArray[minIndex]) {
          minIndex = j;
        }
      }
      
      if (minIndex !== i) {
        [sortedArray[i], sortedArray[minIndex]] = [sortedArray[minIndex], sortedArray[i]];
        steps.push({
          array: [...sortedArray],
          swapIndices: [i, minIndex],
          comparisonCount
        });
      }
    }
    
    const executionTime = Date.now() - startTime;
    
    return {
      steps,
      sortedArray,
      executionTime,
      algorithmType: 'selection',
      totalComparisons: comparisonCount
    };
  }

  static insertionSort(arr) {
    const startTime = Date.now();
    const steps = [];
    const sortedArray = [...arr];
    let comparisonCount = 0;
    
    steps.push({
      array: [...sortedArray],
      swapIndices: null,
      comparisonCount
    });

    for (let i = 1; i < sortedArray.length; i++) {
      const key = sortedArray[i];
      let j = i - 1;
      
      while (j >= 0) {
        comparisonCount++;
        if (sortedArray[j] > key) {
          sortedArray[j + 1] = sortedArray[j];
          steps.push({
            array: [...sortedArray],
            swapIndices: [j, j + 1],
            comparisonCount
          });
          j--;
        } else {
          break;
        }
      }
      
      sortedArray[j + 1] = key;
      if (j + 1 !== i) {
        steps.push({
          array: [...sortedArray],
          swapIndices: [j + 1, i],
          comparisonCount
        });
      }
    }
    
    const executionTime = Date.now() - startTime;
    
    return {
      steps,
      sortedArray,
      executionTime,
      algorithmType: 'insertion',
      totalComparisons: comparisonCount
    };
  }

  static sort(array, algorithm = 'bubble') {
    try {
      if (!Array.isArray(array)) {
        throw new Error('Input must be an array');
      }
      
      if (array.length === 0) {
        throw new Error('Array cannot be empty');
      }
      
      if (array.length > (parseInt(process.env.MAX_ARRAY_SIZE) || 1000)) {
        throw new Error(`Array size exceeds maximum limit of ${process.env.MAX_ARRAY_SIZE || 1000}`);
      }

      const isAlreadySorted = array.every((val, i) => i === 0 || array[i - 1] <= val);
      if (isAlreadySorted) {
        logger.info('Array is already sorted', { algorithm, arraySize: array.length });
        return {
          steps: [{ array: [...array], swapIndices: null, comparisonCount: 0 }],
          sortedArray: [...array],
          executionTime: 0,
          algorithmType: algorithm,
          totalComparisons: 0
        };
      }

      logger.info('Starting sort operation', {
        algorithm,
        arraySize: array.length,
        preview: array.slice(0, 10)
      });

      let result;
      switch (algorithm.toLowerCase()) {
        case 'bubble':
          result = this.bubbleSort(array);
          break;
        case 'quick':
          result = this.quickSort(array);
          break;
        case 'selection':
          result = this.selectionSort(array);
          break;
        case 'insertion':
          result = this.insertionSort(array);
          break;
        default:
          throw new Error(`Unsupported sorting algorithm: ${algorithm}`);
      }

      logger.info('Sort operation completed', {
        algorithm: result.algorithmType,
        arraySize: array.length,
        steps: result.steps.length,
        executionTime: result.executionTime,
        comparisons: result.totalComparisons
      });

      return result;
      
    } catch (error) {
      logger.error('Error in sorting operation', {
        algorithm,
        arraySize: array?.length || 0,
        error: error.message
      });
      throw error;
    }
  }

  static getAlgorithmComplexity(algorithm, arraySize) {
    const complexities = {
      bubble: {
        best: 'O(n)',
        average: 'O(n²)',
        worst: 'O(n²)',
        space: 'O(1)'
      },
      quick: {
        best: 'O(n log n)',
        average: 'O(n log n)',
        worst: 'O(n²)',
        space: 'O(log n)'
      },
      selection: {
        best: 'O(n²)',
        average: 'O(n²)',
        worst: 'O(n²)',
        space: 'O(1)'
      },
      insertion: {
        best: 'O(n)',
        average: 'O(n²)',
        worst: 'O(n²)',
        space: 'O(1)'
      }
    };

    return complexities[algorithm.toLowerCase()] || null;
  }

  static estimateExecutionTime(algorithm, arraySize) {
    const baseTimes = {
      bubble: 0.001, 
      quick: 0.0001,
      selection: 0.0008,
      insertion: 0.0005
    };

    const baseTime = baseTimes[algorithm.toLowerCase()] || 0.001;
    
    switch (algorithm.toLowerCase()) {
      case 'bubble':
      case 'selection':
        return Math.ceil(baseTime * arraySize * arraySize);
      case 'insertion':
        return Math.ceil(baseTime * arraySize * arraySize * 0.5);
      case 'quick':
        return Math.ceil(baseTime * arraySize * Math.log2(arraySize));
      default:
        return Math.ceil(baseTime * arraySize * arraySize);
    }
  }
}

module.exports = SortingAlgorithms;