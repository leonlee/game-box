import { LessonDef } from '../types';

// Lesson 16: Vて形の接続 (Connecting actions), Vてから (After doing),
// A-くて / NA-で (Adjective connection)
export const lesson16: LessonDef = {
  id: 16,
  title: '第16课 连接动作与形容词',
  titleJa: 'Vて形の接続 / Vてから / 形容詞の接続',
  difficulty: 'basic',
  grammarPoints: [
    {
      pattern: 'V₁て、V₂て、V₃',
      meaning: '用て形连接多个动作（按时间顺序）',
      examples: [
        { ja: '朝起きて、顔を洗って、朝ごはんを食べます。', zh: '早上起床，洗脸，吃早饭。' },
        { ja: '駅まで歩いて、電車に乗ります。', zh: '走到车站，坐电车。' },
      ],
    },
    {
      pattern: 'Vてから、〜',
      meaning: '表示"做完某事之后，再做另一件事"',
      examples: [
        { ja: '宿題をしてから、遊びます。', zh: '做完作业之后去玩。' },
        { ja: 'ご飯を食べてから、薬を飲みます。', zh: '吃完饭之后吃药。' },
      ],
    },
    {
      pattern: 'い形 → ～くて / な形 → ～で',
      meaning: '形容词的て形连接',
      examples: [
        { ja: 'この部屋は広くて、明るいです。', zh: '这个房间又宽敞又明亮。' },
        { ja: 'この町は静かで、きれいです。', zh: '这个城镇又安静又漂亮。' },
      ],
    },
  ],
  vocab: [
    { ja: '起きる', reading: 'おきる', zh: '起床' },
    { ja: '洗う', reading: 'あらう', zh: '洗' },
    { ja: '歩く', reading: 'あるく', zh: '走路' },
    { ja: '乗る', reading: 'のる', zh: '乘坐' },
    { ja: '遊ぶ', reading: 'あそぶ', zh: '玩耍' },
    { ja: '宿題', reading: 'しゅくだい', zh: '作业' },
    { ja: '薬', reading: 'くすり', zh: '药' },
    { ja: '広い', reading: 'ひろい', zh: '宽敞的' },
    { ja: '明るい', reading: 'あかるい', zh: '明亮的' },
    { ja: '静か', reading: 'しずか', zh: '安静的' },
    { ja: '顔', reading: 'かお', zh: '脸' },
    { ja: '朝ごはん', reading: 'あさごはん', zh: '早饭' },
    { ja: '駅', reading: 'えき', zh: '车站' },
    { ja: '電車', reading: 'でんしゃ', zh: '电车' },
    { ja: '部屋', reading: 'へや', zh: '房间' },
  ],
  vocabQuestions: [
    { type: 'vocab', prompt: '起きる', promptAudio: 'おきる', choices: ['起床', '睡觉', '休息', '站起来'], correctIndex: 0 },
    { type: 'vocab', prompt: '洗う', promptAudio: 'あらう', choices: ['擦', '洗', '切', '干'], correctIndex: 1 },
    { type: 'vocab', prompt: '歩く', promptAudio: 'あるく', choices: ['跑', '飞', '走路', '游泳'], correctIndex: 2 },
    { type: 'vocab', prompt: '乗る', promptAudio: 'のる', choices: ['开车', '下车', '等待', '乘坐'], correctIndex: 3 },
    { type: 'vocab', prompt: '遊ぶ', promptAudio: 'あそぶ', choices: ['玩耍', '学习', '工作', '运动'], correctIndex: 0 },
    { type: 'vocab', prompt: '宿題', promptAudio: 'しゅくだい', choices: ['课文', '作业', '考试', '笔记'], correctIndex: 1 },
    { type: 'vocab', prompt: '薬', promptAudio: 'くすり', choices: ['水', '茶', '药', '饭'], correctIndex: 2 },
    { type: 'vocab', prompt: '広い', promptAudio: 'ひろい', choices: ['窄的', '暗的', '小的', '宽敞的'], correctIndex: 3 },
    { type: 'vocab', prompt: '明るい', promptAudio: 'あかるい', choices: ['明亮的', '暗的', '安静的', '吵闹的'], correctIndex: 0 },
    { type: 'vocab', prompt: '静か', promptAudio: 'しずか', choices: ['热闹的', '安静的', '漂亮的', '有名的'], correctIndex: 1 },
    { type: 'vocab', prompt: '顔', promptAudio: 'かお', choices: ['手', '脚', '脸', '头'], correctIndex: 2 },
    { type: 'vocab', prompt: '朝ごはん', promptAudio: 'あさごはん', choices: ['午饭', '晚饭', '夜宵', '早饭'], correctIndex: 3 },
    { type: 'vocab', prompt: '駅', promptAudio: 'えき', choices: ['车站', '机场', '港口', '公园'], correctIndex: 0 },
    { type: 'vocab', prompt: '電車', promptAudio: 'でんしゃ', choices: ['汽车', '电车', '自行车', '飞机'], correctIndex: 1 },
    { type: 'vocab', prompt: '部屋', promptAudio: 'へや', choices: ['学校', '公司', '房间', '厨房'], correctIndex: 2 },
  ],
  assemblyQuestions: [
    {
      type: 'assembly',
      meaning: '早上起床，洗脸，吃早饭。',
      blocks: ['食べます', '朝ごはんを', '起きて', '洗って', '朝', '顔を'],
      correctOrder: ['朝', '起きて', '顔を', '洗って', '朝ごはんを', '食べます'],
    },
    {
      type: 'assembly',
      meaning: '走到车站，坐电车。',
      blocks: ['電車に', '歩いて', '乗ります', '駅まで'],
      correctOrder: ['駅まで', '歩いて', '電車に', '乗ります'],
    },
    {
      type: 'assembly',
      meaning: '做完作业之后去玩。',
      blocks: ['遊びます', 'してから', '宿題を'],
      correctOrder: ['宿題を', 'してから', '遊びます'],
    },
    {
      type: 'assembly',
      meaning: '吃完饭之后吃药。',
      blocks: ['食べてから', '飲みます', 'ご飯を', '薬を'],
      correctOrder: ['ご飯を', '食べてから', '薬を', '飲みます'],
    },
    {
      type: 'assembly',
      meaning: '这个房间又宽敞又明亮。',
      blocks: ['広くて', 'この部屋は', '明るいです'],
      correctOrder: ['この部屋は', '広くて', '明るいです'],
    },
    {
      type: 'assembly',
      meaning: '这个城镇又安静又漂亮。',
      blocks: ['きれいです', 'この町は', '静かで'],
      correctOrder: ['この町は', '静かで', 'きれいです'],
    },
    {
      type: 'assembly',
      meaning: '回家之后洗澡。',
      blocks: ['お風呂に', '帰ってから', '入ります', '家に'],
      correctOrder: ['家に', '帰ってから', 'お風呂に', '入ります'],
    },
    {
      type: 'assembly',
      meaning: '这家餐厅便宜又好吃。',
      blocks: ['おいしいです', 'あのレストランは', '安くて'],
      correctOrder: ['あのレストランは', '安くて', 'おいしいです'],
    },
    {
      type: 'assembly',
      meaning: '打扫房间之后出去。',
      blocks: ['部屋を', '出かけます', '掃除してから'],
      correctOrder: ['部屋を', '掃除してから', '出かけます'],
    },
    {
      type: 'assembly',
      meaning: '穿上外套出门。',
      blocks: ['出かけます', 'コートを', '着て'],
      correctOrder: ['コートを', '着て', '出かけます'],
    },
  ],
  grammarCheckQuestions: [
    {
      type: 'grammar_check',
      prompt: '哪句正确表达了"做完作业之后去玩"？',
      sentences: [
        '宿題をしてから、遊びます。',
        '宿題をして、から遊びます。',
        '宿題をするから、遊びます。',
      ],
      correctIndex: 0,
      explanation: '「Vてから」表示做完之后，「から」直接接在て形后面，中间不加逗号。',
    },
    {
      type: 'grammar_check',
      prompt: '哪句正确使用了形容词连接？',
      sentences: [
        'この部屋は広いて、明るいです。',
        'この部屋は広くて、明るいです。',
        'この部屋は広で、明るいです。',
      ],
      correctIndex: 1,
      explanation: 'い形容词的て形是去掉「い」加「くて」。「広い」→「広くて」。',
    },
    {
      type: 'grammar_check',
      prompt: '哪句正确使用了な形容词连接？',
      sentences: [
        'この町は静かくて、きれいです。',
        'この町は静かて、きれいです。',
        'この町は静かで、きれいです。',
      ],
      correctIndex: 2,
      explanation: 'な形容词的て形是词干加「で」。「静か」→「静かで」。',
    },
    {
      type: 'grammar_check',
      prompt: '以下哪个句子的动作顺序表达有误？',
      sentences: [
        '朝起きて、顔を洗います。',
        '手を洗ってから、ご飯を食べます。',
        '宿題をしてから遊んで、から帰ります。',
      ],
      correctIndex: 2,
      explanation: '「てから」不能重复使用。应改为「遊んでから帰ります」或用て形连接。',
    },
    {
      type: 'grammar_check',
      prompt: '哪句正确表达"洗完手之后吃饭"？',
      sentences: [
        '手を洗ってから、ご飯を食べます。',
        '手を洗って、からご飯を食べます。',
        '手を洗うてから、ご飯を食べます。',
      ],
      correctIndex: 0,
      explanation: '「洗う」的て形是「洗って」，然后加「から」表示"之后"。',
    },
    {
      type: 'grammar_check',
      prompt: '"这道菜又甜又好吃"哪个说法正确？',
      sentences: [
        'この料理は甘いで、おいしいです。',
        'この料理は甘くて、おいしいです。',
        'この料理は甘で、おいしいです。',
      ],
      correctIndex: 1,
      explanation: '「甘い」是い形容词，て形连接要用「甘くて」。',
    },
    {
      type: 'grammar_check',
      prompt: '哪句正确连接了两个动作？',
      sentences: [
        '図書館に行きて、本を借ります。',
        '図書館に行って、本を借ります。',
        '図書館に行くて、本を借ります。',
      ],
      correctIndex: 1,
      explanation: '「行く」的て形是「行って」（特殊变化），不是「行きて」。',
    },
    {
      type: 'grammar_check',
      prompt: '哪句正确表达了"这个人又亲切又有趣"？',
      sentences: [
        'この人は親切くて、おもしろいです。',
        'この人は親切で、おもしろいです。',
        'この人は親切して、おもしろいです。',
      ],
      correctIndex: 1,
      explanation: '「親切」是な形容词，て形连接用「親切で」。',
    },
  ],
  dialogueQuestions: [
    {
      type: 'dialogue',
      context: '妈妈叮嘱孩子放学后的安排。',
      lines: [
        { speaker: '妈妈', text: '学校から帰ってから、まず何をしますか。' },
        { speaker: '孩子', text: '___', isBlank: true },
      ],
      choices: [
        '宿題をしてから、遊びます。',
        '宿題をして遊びますから。',
        '遊んでから、宿題をしてから。',
      ],
      correctIndex: 0,
    },
    {
      type: 'dialogue',
      context: '朋友在描述新搬进的公寓。',
      lines: [
        { speaker: '朋友A', text: '新しいマンションはどうですか。' },
        { speaker: '朋友B', text: '___', isBlank: true },
      ],
      choices: [
        '広いて、明るいです。',
        '広くて、明るいです。',
        '広で、明るいです。',
      ],
      correctIndex: 1,
    },
    {
      type: 'dialogue',
      context: '在旅馆，服务员介绍早餐流程。',
      lines: [
        { speaker: '服务员', text: '朝、起きてから、一階のレストランに来てください。' },
        { speaker: '客人', text: '朝ごはんの前に何をしますか。' },
        { speaker: '服务员', text: '___', isBlank: true },
      ],
      choices: [
        '手を洗ってから、食べてください。',
        '手を洗うから、食べてください。',
        '手を洗ってもいいです。',
      ],
      correctIndex: 0,
    },
    {
      type: 'dialogue',
      context: '介绍自己的故乡。',
      lines: [
        { speaker: '友人', text: 'あなたの故郷はどんなところですか。' },
        { speaker: '自分', text: '___', isBlank: true },
      ],
      choices: [
        '静かくて、きれいなところです。',
        '静かで、きれいなところです。',
        '静かの、きれいなところです。',
      ],
      correctIndex: 1,
    },
    {
      type: 'dialogue',
      context: '描述每天早上的流程。',
      lines: [
        { speaker: '先生', text: '毎朝、何をしますか。' },
        { speaker: '学生', text: '___', isBlank: true },
      ],
      choices: [
        '起きて、シャワーを浴びて、朝ごはんを食べます。',
        '起きるて、シャワーを浴びるて、朝ごはんを食べます。',
        '起きてから、シャワーを浴びてから、朝ごはんを食べてから。',
      ],
      correctIndex: 0,
    },
    {
      type: 'dialogue',
      context: '吃完饭后要做什么。',
      lines: [
        { speaker: 'A', text: 'ご飯を食べてから、何をしますか。' },
        { speaker: 'B', text: '___', isBlank: true },
      ],
      choices: [
        'コーヒーを飲んで、テレビを見ます。',
        'コーヒーを飲むて、テレビを見ます。',
        'コーヒーを飲んでから見るてから。',
      ],
      correctIndex: 0,
    },
  ],
};
