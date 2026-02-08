const strings: Record<string, string> = {
  // App
  appTitle: '我们的日本语',
  appSubtitle: '文法冒险 · みんなの日本語 15-25课',

  // Player select
  selectPlayer: '选择冒险者',
  newPlayer: '新建角色',
  enterName: '请输入名字',
  deleteConfirm: '确定删除这个角色吗？',
  delete: '删除',
  cancel: '取消',

  // Title
  startAdventure: '开始冒险',
  continueAdventure: '继续冒险',
  switchPlayer: '切换角色',
  level: '等级',
  xp: '经验值',

  // World
  lessonSelect: '选择课程',
  locked: '未解锁',
  completed: '已完成',
  lesson: '第{}课',

  // Stage intro
  stageIntro: '课程介绍',
  grammarPoints: '语法要点',
  startLesson: '开始学习',
  back: '返回',
  modules: '学习模块',

  // Module names
  vocab_sprint: '词汇冲刺',
  sentence_assembly: '造句组装',
  grammar_check: '语法判断',
  dialogue: '对话练习',
  boss: 'Boss挑战',

  // Gameplay
  question: '第{}/{}题',
  timeLeft: '剩余时间',
  score: '得分',
  combo: '连击',
  check: '确认',
  next: '下一题',
  skip: '跳过',
  hint: '提示',

  // Feedback
  correct: '正确！',
  incorrect: '再想想...',
  correctAnswer: '正确答案',
  explanation: '解析',
  greatJob: '太棒了！',
  keepGoing: '继续加油！',
  tryAgain: '再试一次',

  // Results
  moduleComplete: '模块完成',
  stageComplete: '课程完成',
  accuracy: '正确率',
  timeTaken: '用时',
  xpEarned: '获得经验',
  starsEarned: '获得星星',
  newRecord: '新纪录！',
  nextModule: '下一模块',
  backToWorld: '返回世界',
  retry: '重新挑战',
  buildingGrew: '建筑升级了！',

  // Journal
  journal: '错题本',
  noMistakes: '还没有错题记录',
  reviewMistakes: '复习错题',
  filter: '筛选',
  all: '全部',

  // Boss
  bossAppears: 'Boss出现了！',
  bossDefeated: 'Boss被击败了！',
  bossFailed: 'Boss还很强...',
  bossHp: 'Boss HP',

  // Streak & badges
  streak: '连续学习',
  days: '天',
  badge: '徽章',
  newBadge: '获得新徽章！',

  // Misc
  loading: '加载中...',
  confirm: '确定',
};

export function t(key: string, ...args: (string | number)[]): string {
  let s = strings[key] ?? key;
  args.forEach((arg, i) => {
    s = s.replace('{}', String(arg));
  });
  return s;
}
