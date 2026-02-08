import { LessonDef } from '../types';

// Lesson 18: ことができます (Can do), 趣味は〜ことです (Hobby is doing), 前に (Before doing)
export const lesson18: LessonDef = {
  id: 18,
  title: '第18课 能够…/爱好是…/在…之前',
  titleJa: 'Vることができます / 趣味は〜ことです / Vる前に',
  difficulty: 'basic',
  grammarPoints: [
    {
      pattern: 'Vる（辞書形）＋ことができます',
      meaning: '表示能力或可能："能够做…/会做…"',
      examples: [
        { ja: '田中さんは英語を話すことができます。', zh: '田中会说英语。' },
        { ja: 'ここでインターネットを使うことができます。', zh: '在这里可以使用网络。' },
      ],
    },
    {
      pattern: '趣味は〜ことです',
      meaning: '用「こと」把动词名词化，表示爱好',
      examples: [
        { ja: '趣味は映画を見ることです。', zh: '爱好是看电影。' },
        { ja: '私の趣味は料理を作ることです。', zh: '我的爱好是做菜。' },
      ],
    },
    {
      pattern: 'Vる前に / Nの前に',
      meaning: '在做某事之前："做…之前"',
      examples: [
        { ja: '寝る前に、歯を磨きます。', zh: '睡觉之前刷牙。' },
        { ja: '食事の前に、手を洗います。', zh: '吃饭之前洗手。' },
      ],
    },
  ],
  vocab: [
    { ja: '弾く', reading: 'ひく', zh: '弹奏（乐器）' },
    { ja: '泳ぐ', reading: 'およぐ', zh: '游泳' },
    { ja: '運転する', reading: 'うんてんする', zh: '驾驶' },
    { ja: '料理する', reading: 'りょうりする', zh: '做菜' },
    { ja: '歌う', reading: 'うたう', zh: '唱歌' },
    { ja: '集める', reading: 'あつめる', zh: '收集' },
    { ja: '磨く', reading: 'みがく', zh: '刷/磨' },
    { ja: '趣味', reading: 'しゅみ', zh: '爱好' },
    { ja: 'ピアノ', reading: 'ぴあの', zh: '钢琴' },
    { ja: 'ギター', reading: 'ぎたー', zh: '吉他' },
    { ja: '切手', reading: 'きって', zh: '邮票' },
    { ja: '旅行', reading: 'りょこう', zh: '旅行' },
    { ja: '食事', reading: 'しょくじ', zh: '用餐' },
    { ja: '出発', reading: 'しゅっぱつ', zh: '出发' },
    { ja: '外国語', reading: 'がいこくご', zh: '外语' },
  ],
  vocabQuestions: [
    { type: 'vocab', prompt: '弾く', promptAudio: 'ひく', choices: ['弹奏', '吹', '敲', '拉'], correctIndex: 0 },
    { type: 'vocab', prompt: '泳ぐ', promptAudio: 'およぐ', choices: ['跑步', '游泳', '走路', '骑车'], correctIndex: 1 },
    { type: 'vocab', prompt: '運転する', promptAudio: 'うんてんする', choices: ['散步', '购物', '驾驶', '旅行'], correctIndex: 2 },
    { type: 'vocab', prompt: '料理する', promptAudio: 'りょうりする', choices: ['打扫', '洗衣', '购物', '做菜'], correctIndex: 3 },
    { type: 'vocab', prompt: '歌う', promptAudio: 'うたう', choices: ['唱歌', '跳舞', '画画', '弹琴'], correctIndex: 0 },
    { type: 'vocab', prompt: '集める', promptAudio: 'あつめる', choices: ['丢弃', '收集', '分散', '整理'], correctIndex: 1 },
    { type: 'vocab', prompt: '磨く', promptAudio: 'みがく', choices: ['切', '洗', '刷', '擦'], correctIndex: 2 },
    { type: 'vocab', prompt: '趣味', promptAudio: 'しゅみ', choices: ['工作', '学习', '休息', '爱好'], correctIndex: 3 },
    { type: 'vocab', prompt: 'ピアノ', promptAudio: 'ぴあの', choices: ['钢琴', '小提琴', '吉他', '鼓'], correctIndex: 0 },
    { type: 'vocab', prompt: 'ギター', promptAudio: 'ぎたー', choices: ['钢琴', '吉他', '笛子', '鼓'], correctIndex: 1 },
    { type: 'vocab', prompt: '切手', promptAudio: 'きって', choices: ['信封', '明信片', '邮票', '信纸'], correctIndex: 2 },
    { type: 'vocab', prompt: '旅行', promptAudio: 'りょこう', choices: ['出差', '散步', '购物', '旅行'], correctIndex: 3 },
    { type: 'vocab', prompt: '食事', promptAudio: 'しょくじ', choices: ['用餐', '零食', '饮料', '甜点'], correctIndex: 0 },
    { type: 'vocab', prompt: '出発', promptAudio: 'しゅっぱつ', choices: ['到达', '出发', '返回', '停留'], correctIndex: 1 },
    { type: 'vocab', prompt: '外国語', promptAudio: 'がいこくご', choices: ['母语', '方言', '外语', '日语'], correctIndex: 2 },
    { type: 'vocab', prompt: '歯', promptAudio: 'は', choices: ['耳朵', '鼻子', '眼睛', '牙齿'], correctIndex: 3 },
  ],
  assemblyQuestions: [
    {
      type: 'assembly',
      meaning: '田中会说英语。',
      blocks: ['ことができます', '田中さんは', '話す', '英語を'],
      correctOrder: ['田中さんは', '英語を', '話す', 'ことができます'],
    },
    {
      type: 'assembly',
      meaning: '你会弹钢琴吗？',
      blocks: ['ことができますか', '弾く', 'ピアノを'],
      correctOrder: ['ピアノを', '弾く', 'ことができますか'],
    },
    {
      type: 'assembly',
      meaning: '我的爱好是看电影。',
      blocks: ['見ることです', '映画を', '趣味は'],
      correctOrder: ['趣味は', '映画を', '見ることです'],
    },
    {
      type: 'assembly',
      meaning: '我的爱好是收集邮票。',
      blocks: ['集めることです', '私の趣味は', '切手を'],
      correctOrder: ['私の趣味は', '切手を', '集めることです'],
    },
    {
      type: 'assembly',
      meaning: '睡觉之前刷牙。',
      blocks: ['磨きます', '前に', '寝る', '歯を'],
      correctOrder: ['寝る', '前に', '歯を', '磨きます'],
    },
    {
      type: 'assembly',
      meaning: '吃饭之前洗手。',
      blocks: ['手を', '洗います', '食事の', '前に'],
      correctOrder: ['食事の', '前に', '手を', '洗います'],
    },
    {
      type: 'assembly',
      meaning: '在这里可以使用网络。',
      blocks: ['使う', 'ここで', 'ことができます', 'インターネットを'],
      correctOrder: ['ここで', 'インターネットを', '使う', 'ことができます'],
    },
    {
      type: 'assembly',
      meaning: '出发之前确认一下。',
      blocks: ['前に', '確認します', '出発する'],
      correctOrder: ['出発する', '前に', '確認します'],
    },
    {
      type: 'assembly',
      meaning: '我会游泳。',
      blocks: ['ことができます', '泳ぐ', '私は'],
      correctOrder: ['私は', '泳ぐ', 'ことができます'],
    },
    {
      type: 'assembly',
      meaning: '来日本之前学了日语。',
      blocks: ['日本語を', '勉強しました', '前に', '日本に来る'],
      correctOrder: ['日本に来る', '前に', '日本語を', '勉強しました'],
    },
    {
      type: 'assembly',
      meaning: '她的爱好是唱歌。',
      blocks: ['歌うことです', '彼女の', '趣味は'],
      correctOrder: ['彼女の', '趣味は', '歌うことです'],
    },
  ],
  grammarCheckQuestions: [
    {
      type: 'grammar_check',
      prompt: '哪句正确表达了"我会说日语"？',
      sentences: [
        '私は日本語を話すことができます。',
        '私は日本語を話してことができます。',
        '私は日本語を話したことができます。',
      ],
      correctIndex: 0,
      explanation: '「ことができます」前面要接动词辞书形（基本形），即「話す」。',
    },
    {
      type: 'grammar_check',
      prompt: '哪句正确表达了"爱好是旅行"？',
      sentences: [
        '趣味は旅行するのことです。',
        '趣味は旅行することです。',
        '趣味は旅行してことです。',
      ],
      correctIndex: 1,
      explanation: '「趣味は〜ことです」中，动词用辞书形加「こと」。「旅行する」→「旅行すること」。',
    },
    {
      type: 'grammar_check',
      prompt: '哪句正确使用了"〜前に"？',
      sentences: [
        '寝る前に、歯を磨きます。',
        '寝た前に、歯を磨きます。',
        '寝て前に、歯を磨きます。',
      ],
      correctIndex: 0,
      explanation: '「〜前に」前面要接动词辞书形。「寝る」是辞书形，所以用「寝る前に」。',
    },
    {
      type: 'grammar_check',
      prompt: '以下哪个句子的语法有错误？',
      sentences: [
        '趣味は音楽を聞くことです。',
        'ここで泳ぐことができます。',
        '会議の前に、資料を読むことができます。',
      ],
      correctIndex: 2,
      explanation: '第三句语法正确但语义不自然。"开会之前能读资料"更合适用「読みます」。但从语法结构看三句都正确。这里重点考察「〜前に」后面通常接实际要做的动作。',
    },
    {
      type: 'grammar_check',
      prompt: '哪句正确表达了"你会做菜吗？"',
      sentences: [
        '料理を作ることができますか。',
        '料理を作るのができますか。',
        '料理を作ってことができますか。',
      ],
      correctIndex: 0,
      explanation: '「ことができます」前面用动词辞书形，即「作る＋ことができますか」。',
    },
    {
      type: 'grammar_check',
      prompt: '哪句正确表达了"考试之前要复习"？',
      sentences: [
        '試験の前に、復習します。',
        '試験が前に、復習します。',
        '試験を前に、復習します。',
      ],
      correctIndex: 0,
      explanation: '名词接「前に」时用「Nの前に」。「試験」是名词，所以用「試験の前に」。',
    },
    {
      type: 'grammar_check',
      prompt: '哪句正确表达了"我不会开车"？',
      sentences: [
        '車を運転することができません。',
        '車を運転しないことができます。',
        '車を運転するができません。',
      ],
      correctIndex: 0,
      explanation: '否定形是「ことができません」。「運転する＋ことができません」表示不能/不会开车。',
    },
    {
      type: 'grammar_check',
      prompt: '哪句正确表达了"出门之前看天气预报"？',
      sentences: [
        '出かける前に、天気予報を見ます。',
        '出かけて前に、天気予報を見ます。',
        '出かけた前に、天気予報を見ます。',
      ],
      correctIndex: 0,
      explanation: '「〜前に」前面接动词辞书形。「出かける」是辞书形，所以是「出かける前に」。',
    },
  ],
  dialogueQuestions: [
    {
      type: 'dialogue',
      context: '新同学自我介绍时谈论自己的爱好。',
      lines: [
        { speaker: '同学A', text: '趣味は何ですか。' },
        { speaker: '同学B', text: '___', isBlank: true },
      ],
      choices: [
        '趣味はギターを弾くことです。',
        '趣味はギターを弾いてことです。',
        '趣味はギターを弾くでことです。',
      ],
      correctIndex: 0,
    },
    {
      type: 'dialogue',
      context: '面试时，面试官问求职者的能力。',
      lines: [
        { speaker: '面试官', text: '外国語を話すことができますか。' },
        { speaker: '求职者', text: '___', isBlank: true },
      ],
      choices: [
        'はい、英語と中国語を話すことができます。',
        'はい、英語と中国語を話してことができます。',
        'はい、英語と中国語を話したことがあります。',
      ],
      correctIndex: 0,
    },
    {
      type: 'dialogue',
      context: '妈妈叮嘱孩子睡前该做什么。',
      lines: [
        { speaker: '妈妈', text: '寝る前に、何をしなければなりませんか。' },
        { speaker: '孩子', text: '___', isBlank: true },
      ],
      choices: [
        '寝る前に、歯を磨きます。',
        '寝た前に、歯を磨きます。',
        '寝て前に、歯を磨きます。',
      ],
      correctIndex: 0,
    },
    {
      type: 'dialogue',
      context: '在游泳池，教练问学生。',
      lines: [
        { speaker: '教练', text: '25メートル泳ぐことができますか。' },
        { speaker: '学生', text: '___', isBlank: true },
      ],
      choices: [
        'いいえ、まだ泳ぐことができません。',
        'いいえ、まだ泳いでことができません。',
        'いいえ、まだ泳がないことです。',
      ],
      correctIndex: 0,
    },
    {
      type: 'dialogue',
      context: '旅行前的准备。',
      lines: [
        { speaker: '朋友', text: '旅行の前に、何をしますか。' },
        { speaker: '自分', text: '___', isBlank: true },
      ],
      choices: [
        '旅行の前に、ホテルを予約します。',
        '旅行が前に、ホテルを予約します。',
        '旅行を前に、ホテルを予約します。',
      ],
      correctIndex: 0,
    },
    {
      type: 'dialogue',
      context: '朋友之间谈论各自会做的事情。',
      lines: [
        { speaker: '友人A', text: '私は料理を作ることができます。Bさんは？' },
        { speaker: '友人B', text: '___', isBlank: true },
      ],
      choices: [
        '私は料理を作ることができません。でも、ケーキを焼くことができます。',
        '私は料理を作ってができません。でも、ケーキを焼くことです。',
        '私は料理を作らないことです。でも、ケーキは焼きます。',
      ],
      correctIndex: 0,
    },
    {
      type: 'dialogue',
      context: '两个人谈论出发前要做的事。',
      lines: [
        { speaker: 'A', text: '出発する前に、パスポートを確認しましたか。' },
        { speaker: 'B', text: '___', isBlank: true },
      ],
      choices: [
        'はい、出発する前に、確認しました。',
        'はい、出発した前に、確認しました。',
        'はい、出発して前に、確認しました。',
      ],
      correctIndex: 0,
    },
  ],
};
