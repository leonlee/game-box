import { LessonDef } from '../types';

// Lesson 15: Vてもいいです (Permission) / Vてはいけません (Prohibition)
export const lesson15: LessonDef = {
  id: 15,
  title: '第15课 可以做…/不可以做…',
  titleJa: 'Vてもいいです / Vてはいけません',
  difficulty: 'basic',
  grammarPoints: [
    {
      pattern: 'Vて形 + もいいです',
      meaning: '表示许可："可以做某事"',
      examples: [
        { ja: '写真を撮ってもいいですか。', zh: '可以拍照吗？' },
        { ja: 'ここに座ってもいいですよ。', zh: '可以坐在这里哦。' },
      ],
    },
    {
      pattern: 'Vて形 + はいけません',
      meaning: '表示禁止："不可以做某事"',
      examples: [
        { ja: 'ここでタバコを吸ってはいけません。', zh: '这里不可以吸烟。' },
        { ja: '教室で食べてはいけません。', zh: '不可以在教室里吃东西。' },
      ],
    },
    {
      pattern: 'Vています（状態）',
      meaning: '表示持续状态："正处于某种状态"',
      examples: [
        { ja: '田中さんは結婚しています。', zh: '田中已经结婚了。' },
        { ja: '私はこの町に住んでいます。', zh: '我住在这个城镇。' },
      ],
    },
  ],
  vocab: [
    { ja: '撮る', reading: 'とる', zh: '拍摄', example: '写真を撮る' },
    { ja: '座る', reading: 'すわる', zh: '坐', example: 'いすに座る' },
    { ja: '吸う', reading: 'すう', zh: '吸', example: 'タバコを吸う' },
    { ja: '使う', reading: 'つかう', zh: '使用', example: '電話を使う' },
    { ja: '置く', reading: 'おく', zh: '放置', example: 'ここに置く' },
    { ja: '住む', reading: 'すむ', zh: '居住', example: '東京に住む' },
    { ja: '知る', reading: 'しる', zh: '知道', example: '名前を知る' },
    { ja: '結婚する', reading: 'けっこんする', zh: '结婚' },
    { ja: '教室', reading: 'きょうしつ', zh: '教室' },
    { ja: '写真', reading: 'しゃしん', zh: '照片' },
    { ja: 'タバコ', reading: 'たばこ', zh: '香烟' },
    { ja: '電話', reading: 'でんわ', zh: '电话' },
    { ja: '美術館', reading: 'びじゅつかん', zh: '美术馆' },
    { ja: '図書館', reading: 'としょかん', zh: '图书馆' },
    { ja: '許可', reading: 'きょか', zh: '许可' },
  ],
  vocabQuestions: [
    { type: 'vocab', prompt: '撮る', promptAudio: 'とる', choices: ['拍摄', '切', '跑', '读'], correctIndex: 0 },
    { type: 'vocab', prompt: '座る', promptAudio: 'すわる', choices: ['站', '坐', '走', '跳'], correctIndex: 1 },
    { type: 'vocab', prompt: '吸う', promptAudio: 'すう', choices: ['吃', '喝', '吸', '吹'], correctIndex: 2 },
    { type: 'vocab', prompt: '使う', promptAudio: 'つかう', choices: ['使用', '买', '卖', '借'], correctIndex: 0 },
    { type: 'vocab', prompt: '置く', promptAudio: 'おく', choices: ['拿', '送', '放置', '扔'], correctIndex: 2 },
    { type: 'vocab', prompt: '住む', promptAudio: 'すむ', choices: ['去', '来', '回', '居住'], correctIndex: 3 },
    { type: 'vocab', prompt: '知る', promptAudio: 'しる', choices: ['知道', '忘记', '想', '问'], correctIndex: 0 },
    { type: 'vocab', prompt: '結婚する', promptAudio: 'けっこんする', choices: ['离婚', '结婚', '恋爱', '分手'], correctIndex: 1 },
    { type: 'vocab', prompt: '教室', promptAudio: 'きょうしつ', choices: ['教室', '办公室', '卧室', '厨房'], correctIndex: 0 },
    { type: 'vocab', prompt: '写真', promptAudio: 'しゃしん', choices: ['绘画', '照片', '视频', '地图'], correctIndex: 1 },
    { type: 'vocab', prompt: '美術館', promptAudio: 'びじゅつかん', choices: ['博物馆', '图书馆', '美术馆', '体育馆'], correctIndex: 2 },
    { type: 'vocab', prompt: '図書館', promptAudio: 'としょかん', choices: ['美术馆', '体育馆', '博物馆', '图书馆'], correctIndex: 3 },
    { type: 'vocab', prompt: 'タバコ', promptAudio: 'たばこ', choices: ['香烟', '咖啡', '茶', '酒'], correctIndex: 0 },
    { type: 'vocab', prompt: '電話', promptAudio: 'でんわ', choices: ['邮件', '电话', '电视', '电脑'], correctIndex: 1 },
    { type: 'vocab', prompt: '許可', promptAudio: 'きょか', choices: ['禁止', '命令', '许可', '拒绝'], correctIndex: 2 },
  ],
  assemblyQuestions: [
    {
      type: 'assembly',
      meaning: '可以拍照吗？',
      blocks: ['撮って', 'を', 'いいですか', '写真', 'も'],
      correctOrder: ['写真', 'を', '撮って', 'も', 'いいですか'],
    },
    {
      type: 'assembly',
      meaning: '可以坐在这里吗？',
      blocks: ['座って', 'いいですか', 'ここ', 'に', 'も'],
      correctOrder: ['ここ', 'に', '座って', 'も', 'いいですか'],
    },
    {
      type: 'assembly',
      meaning: '这里不可以吸烟。',
      blocks: ['ここ', 'タバコ', 'は', 'で', 'いけません', '吸って', 'を'],
      correctOrder: ['ここ', 'で', 'タバコ', 'を', '吸って', 'は', 'いけません'],
    },
    {
      type: 'assembly',
      meaning: '不可以在教室里吃东西。',
      blocks: ['食べて', 'は', 'いけません', 'で', '教室'],
      correctOrder: ['教室', 'で', '食べて', 'は', 'いけません'],
    },
    {
      type: 'assembly',
      meaning: '可以使用电话吗？',
      blocks: ['いいですか', '電話', 'を', '使って', 'も'],
      correctOrder: ['電話', 'を', '使って', 'も', 'いいですか'],
    },
    {
      type: 'assembly',
      meaning: '我住在东京。',
      blocks: ['に', '住んで', '東京', 'います', '私は'],
      correctOrder: ['私は', '東京', 'に', '住んで', 'います'],
    },
    {
      type: 'assembly',
      meaning: '田中已经结婚了。',
      blocks: ['結婚して', 'います', 'は', '田中さん'],
      correctOrder: ['田中さん', 'は', '結婚して', 'います'],
    },
    {
      type: 'assembly',
      meaning: '可以把东西放在这里吗？',
      blocks: ['ここ', '置いて', 'も', 'に', 'いいですか'],
      correctOrder: ['ここ', 'に', '置いて', 'も', 'いいですか'],
    },
    {
      type: 'assembly',
      meaning: '不可以在美术馆拍照。',
      blocks: ['美術館', 'で', '撮って', 'は', 'いけません', '写真', 'を'],
      correctOrder: ['美術館', 'で', '写真', 'を', '撮って', 'は', 'いけません'],
    },
    {
      type: 'assembly',
      meaning: '不可以在图书馆大声说话。',
      blocks: ['話して', 'は', 'いけません', '大きい声で', 'で', '図書館'],
      correctOrder: ['図書館', 'で', '大きい声で', '話して', 'は', 'いけません'],
    },
  ],
  grammarCheckQuestions: [
    {
      type: 'grammar_check',
      prompt: '哪句话正确表示"可以拍照吗？"',
      sentences: [
        '写真を撮ってもいいですか。',
        '写真を撮ってはいいですか。',
        '写真を撮るもいいですか。',
      ],
      correctIndex: 0,
      explanation: '表示许可要用「Vて形＋もいいです」，注意助词「も」。',
    },
    {
      type: 'grammar_check',
      prompt: '哪句话正确表示"这里不可以吸烟"？',
      sentences: [
        'ここでタバコを吸ってもいけません。',
        'ここでタバコを吸ってはいけません。',
        'ここでタバコを吸っていけません。',
      ],
      correctIndex: 1,
      explanation: '表示禁止要用「Vて形＋はいけません」，注意助词「は」。',
    },
    {
      type: 'grammar_check',
      prompt: '哪句话的语法有错误？',
      sentences: [
        '田中さんは結婚しています。',
        '私は東京に住んでいます。',
        'ここに座るてもいいですか。',
      ],
      correctIndex: 2,
      explanation: '应该用て形「座って」而不是「座るて」。动词要先变成て形再加もいいです。',
    },
    {
      type: 'grammar_check',
      prompt: '以下哪个句子正确使用了「Vている」表示状态？',
      sentences: [
        '私は東京に住むています。',
        '私は東京に住んでいます。',
        '私は東京に住んでます。',
        '私は東京に住みています。',
      ],
      correctIndex: 1,
      explanation: '「住む」的て形是「住んで」，所以状态表达是「住んでいます」。',
    },
    {
      type: 'grammar_check',
      prompt: '哪句正确表达了"知道田中先生的电话号码"？',
      sentences: [
        '田中さんの電話番号を知ります。',
        '田中さんの電話番号を知っています。',
        '田中さんの電話番号を知ています。',
      ],
      correctIndex: 1,
      explanation: '「知る」表示状态时要用「知っています」，不能用「知ります」。',
    },
    {
      type: 'grammar_check',
      prompt: '想问老师"可以用日语写吗？"应该说什么？',
      sentences: [
        '日本語で書いてもいいですか。',
        '日本語で書いてはいいですか。',
        '日本語で書くもいいですか。',
      ],
      correctIndex: 0,
      explanation: '请求许可用「Vて形＋もいいですか」。「書く」的て形是「書いて」。',
    },
    {
      type: 'grammar_check',
      prompt: '哪句正确表示"不可以在这里停车"？',
      sentences: [
        'ここに車を止めてもいけません。',
        'ここに車を止めてはいけません。',
        'ここに車を止めないでいいです。',
      ],
      correctIndex: 1,
      explanation: '禁止用「Vて形＋はいけません」。注意「も」用于许可，「は」用于禁止。',
    },
    {
      type: 'grammar_check',
      prompt: '哪句正确表达"铃木已经知道了"？',
      sentences: [
        '鈴木さんはもう知りました。',
        '鈴木さんはもう知っています。',
        '鈴木さんはもう知ります。',
      ],
      correctIndex: 1,
      explanation: '「知る」的状态形式是「知っています」，表示"已经知道（这个状态）"。',
    },
  ],
  dialogueQuestions: [
    {
      type: 'dialogue',
      context: '在美术馆里，小明想拍照。',
      lines: [
        { speaker: '小明', text: 'すみません、写真を撮ってもいいですか。' },
        { speaker: '工作人员', text: '___', isBlank: true },
      ],
      choices: [
        'いいえ、撮ってはいけません。',
        'はい、撮ってもいいですよ。',
        '写真は好きです。',
      ],
      correctIndex: 0,
    },
    {
      type: 'dialogue',
      context: '在教室里，学生想吃便当。',
      lines: [
        { speaker: '学生', text: 'すみません、ここでお弁当を食べてもいいですか。' },
        { speaker: '先生', text: '___', isBlank: true },
      ],
      choices: [
        'はい、食べてもいいですよ。',
        'いいえ、教室で食べてはいけません。',
        'お弁当はおいしいですね。',
      ],
      correctIndex: 1,
    },
    {
      type: 'dialogue',
      context: '客人到朋友家做客。',
      lines: [
        { speaker: '客人', text: 'ここに座ってもいいですか。',  },
        { speaker: '朋友', text: '___', isBlank: true },
        { speaker: '客人', text: 'ありがとうございます。' },
      ],
      choices: [
        'いいえ、座ってはいけません。',
        'はい、どうぞ座ってください。',
        '椅子がありません。',
      ],
      correctIndex: 1,
    },
    {
      type: 'dialogue',
      context: '在图书馆，有人在打电话。',
      lines: [
        { speaker: '图书管理员', text: 'すみません、図書館で電話を___。', isBlank: true },
        { speaker: '来馆者', text: 'すみません。わかりました。' },
      ],
      choices: [
        '使ってもいいですか',
        '使ってはいけません',
        '使っています',
      ],
      correctIndex: 1,
    },
    {
      type: 'dialogue',
      context: '新同事第一天上班，问办公室规矩。',
      lines: [
        { speaker: '新同事', text: 'コーヒーを飲んでもいいですか。' },
        { speaker: '前辈', text: 'はい、___。でも、お酒は飲んではいけませんよ。', isBlank: true },
      ],
      choices: [
        '飲んではいけません',
        '飲んでもいいですよ',
        '飲んでいます',
      ],
      correctIndex: 1,
    },
    {
      type: 'dialogue',
      context: '学生问老师关于考试的规则。',
      lines: [
        { speaker: '学生', text: '先生、テストで辞書を使ってもいいですか。' },
        { speaker: '先生', text: '___', isBlank: true },
      ],
      choices: [
        'いいえ、使ってはいけません。自分で考えてください。',
        'はい、辞書を読んでいます。',
        '辞書はいいものです。',
      ],
      correctIndex: 0,
    },
  ],
};
