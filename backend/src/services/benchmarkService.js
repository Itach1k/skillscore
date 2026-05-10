/**
 * Еталонні (референсні) профілі компетенцій для трьох рівнів.
 * Значення базуються на вимогах ринку до technical-інтерв'ю на відповідні позиції.
 * Шкала — та сама, що й в аналізі: 1..10.
 */

const BENCHMARKS = {
  junior: {
    label: 'Junior',
    description: 'Початковий рівень, очікування ринку для першої роботи',
    scores: {
      theoreticalKnowledge: 5,
      problemSolving: 4,
      technicalCommunication: 5,
      codeQuality: 4,
      architecturalThinking: 3,
    },
  },
  middle: {
    label: 'Middle',
    description: 'Самостійний інженер, 2–4 роки досвіду',
    scores: {
      theoreticalKnowledge: 7,
      problemSolving: 7,
      technicalCommunication: 7,
      codeQuality: 7,
      architecturalThinking: 6,
    },
  },
  senior: {
    label: 'Senior',
    description: 'Архітектурні рішення, менторинг, 5+ років',
    scores: {
      theoreticalKnowledge: 9,
      problemSolving: 9,
      technicalCommunication: 8,
      codeQuality: 9,
      architecturalThinking: 9,
    },
  },
};

function getBenchmarks() {
  return BENCHMARKS;
}

module.exports = { getBenchmarks, BENCHMARKS };
