const strings: Record<string, string> = {
  title: '小小探险家：五十音岛',
  start: '开始冒险',
  continue: '继续冒险',
  level_select: '选择关卡',
  back: '返回',
  next: '下一关',
  replay: '再玩一次',
  listen_prompt: '听一听，选出正确的假名',
  see_prompt: '看一看，这是什么音？',
  mixed_prompt: '挑战时间！',
  tap_to_hear: '点击喇叭再听一遍',
  correct_1: '太棒了！',
  correct_2: '真厉害！',
  correct_3: '答对啦！',
  correct_4: '好聪明！',
  incorrect_1: '再试试看',
  incorrect_2: '别灰心，再想想',
  incorrect_3: '加油哦！',
  level_complete: '关卡完成！',
  stars_earned: '获得星星',
  stickers_earned: '获得贴纸',
  review_level: '复习挑战',
  row_complete: '恭喜！学会了一整行！',
  companion_happy: '小伙伴很开心！',
  companion_cheer: '小伙伴为你加油！',
  companion_level: '小伙伴等级',
  island_piece: '解锁岛屿拼图！',
  score: '得分',
  combo: '连击',
  progress: '进度',
  locked: '未解锁',
  all_clear: '全部通关！你真是五十音大师！',
  player_select: '选择玩家',
  new_player: '新建玩家',
  delete_player: '删除',
  confirm_delete: '确定要删除这个玩家吗？',
  confirm_yes: '确定',
  confirm_no: '取消',
  player_name_prefix: '玩家',
  switch_player: '切换玩家',
};

export function t(key: string): string {
  return strings[key] ?? key;
}

const correctMessages = ['correct_1', 'correct_2', 'correct_3', 'correct_4'];
const incorrectMessages = ['incorrect_1', 'incorrect_2', 'incorrect_3'];

export function randomCorrectMsg(): string {
  return t(correctMessages[Math.floor(Math.random() * correctMessages.length)]);
}

export function randomIncorrectMsg(): string {
  return t(incorrectMessages[Math.floor(Math.random() * incorrectMessages.length)]);
}
