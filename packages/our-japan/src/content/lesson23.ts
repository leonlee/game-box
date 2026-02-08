import { LessonDef } from '../types';

// Lesson 23: 〜とき (When), 〜と (If/when conditional) — REVIEW
export const lesson23: LessonDef = {
  id: 23,
  title: '第23课 …的时候 / 一…就…',
  titleJa: '〜とき / 〜と',
  difficulty: 'synthesis',
  grammarPoints: [
    {
      pattern: 'V辞書形 + とき',
      meaning: '做某事的时候（动作尚未发生）',
      examples: [
        { ja: '国へ帰るとき、お土産を買います。', zh: '回国的时候，买礼物。' },
        { ja: '寝るとき、電気を消します。', zh: '睡觉的时候，关灯。' },
      ],
    },
    {
      pattern: 'Vた形 + とき',
      meaning: '做完某事的时候（动作已经发生）',
      examples: [
        { ja: '国へ帰ったとき、お土産を買いました。', zh: '回国的时候（到了之后），买了礼物。' },
        { ja: '駅に着いたとき、電話してください。', zh: '到达车站的时候，请打电话。' },
      ],
    },
    {
      pattern: 'い形容詞い + とき',
      meaning: '形容词（い）的"…的时候"',
      examples: [
        { ja: '寂しいとき、友だちに電話します。', zh: '寂寞的时候，给朋友打电话。' },
        { ja: '忙しいとき、コンビニで弁当を買います。', zh: '忙的时候，在便利店买便当。' },
      ],
    },
    {
      pattern: 'な形容詞な + とき / Nの + とき',
      meaning: 'な形容词/名词的"…的时候"',
      examples: [
        { ja: '暇なとき、映画を見ます。', zh: '空闲的时候，看电影。' },
        { ja: '子どものとき、よく川で泳ぎました。', zh: '小时候，经常在河里游泳。' },
      ],
    },
    {
      pattern: 'V辞書形 + と',
      meaning: '一…就…（自然规律/习惯性结果）',
      examples: [
        { ja: '春になると、桜が咲きます。', zh: '一到春天，樱花就开了。' },
        { ja: 'このボタンを押すと、ドアが開きます。', zh: '一按这个按钮，门就开了。' },
      ],
    },
  ],
  vocab: [
    { ja: '帰る', reading: 'かえる', zh: '回去', example: '国へ帰る' },
    { ja: 'お土産', reading: 'おみやげ', zh: '礼物/特产' },
    { ja: '消す', reading: 'けす', zh: '关（灯）/擦掉' },
    { ja: '着く', reading: 'つく', zh: '到达', example: '駅に着く' },
    { ja: '寂しい', reading: 'さびしい', zh: '寂寞的' },
    { ja: '暇', reading: 'ひま', zh: '空闲的' },
    { ja: '子ども', reading: 'こども', zh: '小孩' },
    { ja: '泳ぐ', reading: 'およぐ', zh: '游泳' },
    { ja: '咲く', reading: 'さく', zh: '（花）开' },
    { ja: '押す', reading: 'おす', zh: '按/推' },
    { ja: '困る', reading: 'こまる', zh: '为难/困扰' },
    { ja: '電気', reading: 'でんき', zh: '电灯/电' },
    { ja: '春', reading: 'はる', zh: '春天' },
    { ja: '桜', reading: 'さくら', zh: '樱花' },
    { ja: 'ボタン', reading: 'ぼたん', zh: '按钮' },
    { ja: 'コンビニ', reading: 'こんびに', zh: '便利店' },
    { ja: '若い', reading: 'わかい', zh: '年轻的' },
    { ja: '曲がる', reading: 'まがる', zh: '转弯' },
  ],
  vocabQuestions: [
    { type: 'vocab', prompt: 'お土産', promptAudio: 'おみやげ', choices: ['礼物/特产', '行李', '护照', '机票'], correctIndex: 0 },
    { type: 'vocab', prompt: '消す', promptAudio: 'けす', choices: ['开', '关/擦掉', '点', '修'], correctIndex: 1 },
    { type: 'vocab', prompt: '着く', promptAudio: 'つく', choices: ['出发', '回去', '到达', '经过'], correctIndex: 2 },
    { type: 'vocab', prompt: '寂しい', promptAudio: 'さびしい', choices: ['开心的', '生气的', '害怕的', '寂寞的'], correctIndex: 3 },
    { type: 'vocab', prompt: '暇', promptAudio: 'ひま', choices: ['空闲的', '忙碌的', '无聊的', '快乐的'], correctIndex: 0 },
    { type: 'vocab', prompt: '子ども', promptAudio: 'こども', choices: ['大人', '小孩', '老人', '学生'], correctIndex: 1 },
    { type: 'vocab', prompt: '泳ぐ', promptAudio: 'およぐ', choices: ['跑步', '走路', '游泳', '飞'], correctIndex: 2 },
    { type: 'vocab', prompt: '咲く', promptAudio: 'さく', choices: ['枯萎', '种植', '浇水', '（花）开'], correctIndex: 3 },
    { type: 'vocab', prompt: '押す', promptAudio: 'おす', choices: ['按/推', '拉', '举', '抬'], correctIndex: 0 },
    { type: 'vocab', prompt: '困る', promptAudio: 'こまる', choices: ['高兴', '为难/困扰', '哭', '笑'], correctIndex: 1 },
    { type: 'vocab', prompt: '電気', promptAudio: 'でんき', choices: ['水', '火', '电灯/电', '风'], correctIndex: 2 },
    { type: 'vocab', prompt: '春', promptAudio: 'はる', choices: ['夏天', '秋天', '冬天', '春天'], correctIndex: 3 },
    { type: 'vocab', prompt: '桜', promptAudio: 'さくら', choices: ['樱花', '梅花', '菊花', '玫瑰'], correctIndex: 0 },
    { type: 'vocab', prompt: 'ボタン', promptAudio: 'ぼたん', choices: ['钥匙', '按钮', '开关', '把手'], correctIndex: 1 },
    { type: 'vocab', prompt: 'コンビニ', promptAudio: 'こんびに', choices: ['超市', '餐厅', '便利店', '百货店'], correctIndex: 2 },
    { type: 'vocab', prompt: '若い', promptAudio: 'わかい', choices: ['老的', '高的', '矮的', '年轻的'], correctIndex: 3 },
    { type: 'vocab', prompt: '曲がる', promptAudio: 'まがる', choices: ['转弯', '直走', '停止', '后退'], correctIndex: 0 },
  ],
  assemblyQuestions: [
    {
      type: 'assembly',
      meaning: '回国的时候，买礼物。',
      blocks: ['お土産を', '帰る', '買います', '国へ', 'とき'],
      correctOrder: ['国へ', '帰る', 'とき', 'お土産を', '買います'],
    },
    {
      type: 'assembly',
      meaning: '睡觉的时候，关灯。',
      blocks: ['消します', '寝る', 'とき', '電気を'],
      correctOrder: ['寝る', 'とき', '電気を', '消します'],
    },
    {
      type: 'assembly',
      meaning: '到达车站的时候，请打电话。',
      blocks: ['着いた', 'してください', '駅に', '電話', 'とき'],
      correctOrder: ['駅に', '着いた', 'とき', '電話', 'してください'],
    },
    {
      type: 'assembly',
      meaning: '寂寞的时候，给朋友打电话。',
      blocks: ['電話します', '友だちに', 'とき', '寂しい'],
      correctOrder: ['寂しい', 'とき', '友だちに', '電話します'],
    },
    {
      type: 'assembly',
      meaning: '空闲的时候，看电影。',
      blocks: ['見ます', '暇な', '映画を', 'とき'],
      correctOrder: ['暇な', 'とき', '映画を', '見ます'],
    },
    {
      type: 'assembly',
      meaning: '小时候，经常在河里游泳。',
      blocks: ['泳ぎました', 'よく', '子どもの', '川で', 'とき'],
      correctOrder: ['子どもの', 'とき', 'よく', '川で', '泳ぎました'],
    },
    {
      type: 'assembly',
      meaning: '一到春天，樱花就开了。',
      blocks: ['桜が', '春に', '咲きます', 'なると'],
      correctOrder: ['春に', 'なると', '桜が', '咲きます'],
    },
    {
      type: 'assembly',
      meaning: '一按这个按钮，门就开了。',
      blocks: ['開きます', 'この', 'と', 'ドアが', 'ボタンを', '押す'],
      correctOrder: ['この', 'ボタンを', '押す', 'と', 'ドアが', '開きます'],
    },
    {
      type: 'assembly',
      meaning: '忙的时候，在便利店买便当。',
      blocks: ['コンビニで', '弁当を', '買います', '忙しい', 'とき'],
      correctOrder: ['忙しい', 'とき', 'コンビニで', '弁当を', '買います'],
    },
    {
      type: 'assembly',
      meaning: '在那个路口右转就能看到邮局。',
      blocks: ['あの交差点を', '郵便局が', '右に', 'あります', '曲がると'],
      correctOrder: ['あの交差点を', '右に', '曲がると', '郵便局が', 'あります'],
    },
    {
      type: 'assembly',
      meaning: '年轻的时候，去了很多国家。',
      blocks: ['行きました', 'いろいろな', '若い', '国に', 'とき'],
      correctOrder: ['若い', 'とき', 'いろいろな', '国に', '行きました'],
    },
  ],
  grammarCheckQuestions: [
    {
      type: 'grammar_check',
      prompt: '哪句正确表达"回国的时候买礼物"（动作还没发生）？',
      sentences: [
        '国へ帰るとき、お土産を買います。',
        '国へ帰ったとき、お土産を買います。',
        '国へ帰るのとき、お土産を買います。',
      ],
      correctIndex: 0,
      explanation: '动词辞书形＋とき表示动作还没发生时的"…的时候"。「帰る」直接加「とき」。',
    },
    {
      type: 'grammar_check',
      prompt: '哪句正确表达"到了车站的时候请打电话"（动作已完成）？',
      sentences: [
        '駅に着くとき、電話してください。',
        '駅に着いたとき、電話してください。',
        '駅に着いてとき、電話してください。',
      ],
      correctIndex: 1,
      explanation: '动词た形＋とき表示动作已经完成时的"…的时候"。「着く」→「着いた」＋「とき」。',
    },
    {
      type: 'grammar_check',
      prompt: '哪句正确使用了い形容词＋とき？',
      sentences: [
        '寂しなとき、友だちに電話します。',
        '寂しいとき、友だちに電話します。',
        '寂しくとき、友だちに電話します。',
      ],
      correctIndex: 1,
      explanation: 'い形容词直接加「とき」，不需要变形。「寂しい」＋「とき」。',
    },
    {
      type: 'grammar_check',
      prompt: '哪句正确使用了な形容词＋とき？',
      sentences: [
        '暇のとき、映画を見ます。',
        '暇とき、映画を見ます。',
        '暇なとき、映画を見ます。',
      ],
      correctIndex: 2,
      explanation: 'な形容词要加「な」再接「とき」。「暇」→「暇な」＋「とき」。',
    },
    {
      type: 'grammar_check',
      prompt: '哪句正确使用了名词＋とき？',
      sentences: [
        '子どもなとき、よく川で泳ぎました。',
        '子どものとき、よく川で泳ぎました。',
        '子どもとき、よく川で泳ぎました。',
      ],
      correctIndex: 1,
      explanation: '名词要加「の」再接「とき」。「子ども」→「子どもの」＋「とき」。',
    },
    {
      type: 'grammar_check',
      prompt: '哪句正确使用了「〜と」表示自然规律？',
      sentences: [
        '春になると、桜が咲きます。',
        '春になったら、桜が咲きます。',
        '春になって、桜が咲きます。',
      ],
      correctIndex: 0,
      explanation: '「〜と」用于表示自然规律、习惯性结果。「春になる」＋「と」→「一到春天就…」。',
    },
    {
      type: 'grammar_check',
      prompt: '哪句有语法错误？',
      sentences: [
        'このボタンを押すと、ドアが開きます。',
        '暇なとき、散歩します。',
        '若いなとき、たくさん旅行しました。',
      ],
      correctIndex: 2,
      explanation: '「若い」是い形容词，不能加「な」。应该是「若いとき」。',
    },
    {
      type: 'grammar_check',
      prompt: '以下哪句的「〜と」用法是正确的？',
      sentences: [
        'まっすぐ行くと、右に銀行があります。',
        'まっすぐ行くと、右に銀行がありました。',
        'まっすぐ行ったと、右に銀行があります。',
      ],
      correctIndex: 0,
      explanation: '「〜と」后面的句子一般用非过去时（ます/です），因为描述的是必然结果。动词用辞书形接「と」。',
    },
  ],
  dialogueQuestions: [
    {
      type: 'dialogue',
      context: '朋友问去邮局怎么走。',
      lines: [
        { speaker: '友人', text: 'すみません、郵便局はどこですか。' },
        { speaker: '自分', text: '___', isBlank: true },
      ],
      choices: [
        'この道をまっすぐ行くと、左にあります。',
        'この道をまっすぐ行ったら、左にありました。',
        'この道をまっすぐ行って、左にいます。',
      ],
      correctIndex: 0,
    },
    {
      type: 'dialogue',
      context: '同事在问周末的计划。',
      lines: [
        { speaker: '同僚', text: '暇なとき、何をしますか。' },
        { speaker: '自分', text: '___', isBlank: true },
      ],
      choices: [
        '暇なとき、映画を見たり、本を読んだりします。',
        '暇のとき、映画を見ます。',
        '暇とき、映画を見ます。',
      ],
      correctIndex: 0,
    },
    {
      type: 'dialogue',
      context: '旅行前在商店购物。',
      lines: [
        { speaker: '店員', text: '何かお探しですか。' },
        { speaker: '客', text: '___', isBlank: true },
        { speaker: '店員', text: 'それなら、こちらはいかがですか。' },
      ],
      choices: [
        '国へ帰るとき、お土産を買いたいんですが。',
        '国へ帰ったとき、お土産を買いたいんですが。',
        '国へ帰ってとき、お土産を買いたいんですが。',
      ],
      correctIndex: 0,
    },
    {
      type: 'dialogue',
      context: '朋友在聊童年回忆。',
      lines: [
        { speaker: '友人A', text: '子どものとき、何をしましたか。' },
        { speaker: '友人B', text: '___', isBlank: true },
      ],
      choices: [
        '子どもなとき、よくサッカーをしました。',
        '子どものとき、よくサッカーをしました。',
        '子どもとき、よくサッカーをしました。',
      ],
      correctIndex: 1,
    },
    {
      type: 'dialogue',
      context: '在寝室，妈妈叮嘱孩子。',
      lines: [
        { speaker: '母', text: '寝るとき、___を忘れないでね。', isBlank: true },
        { speaker: '子ども', text: 'はい、わかった。' },
      ],
      choices: [
        '電気を消すこと',
        '電気を消したこと',
        '電気を消してこと',
      ],
      correctIndex: 0,
    },
    {
      type: 'dialogue',
      context: '同事在聊困难的事情。',
      lines: [
        { speaker: '同僚A', text: '困ったとき、どうしますか。' },
        { speaker: '同僚B', text: '___', isBlank: true },
      ],
      choices: [
        '困ったとき、先輩に相談します。',
        '困るのとき、先輩に相談します。',
        '困ってとき、先輩に相談します。',
      ],
      correctIndex: 0,
    },
    {
      type: 'dialogue',
      context: '老师在课堂上解释季节变化。',
      lines: [
        { speaker: '先生', text: '日本では、___。', isBlank: true },
        { speaker: '学生', text: 'きれいですね。見てみたいです。' },
      ],
      choices: [
        '春になると、桜が咲きます',
        '春になって、桜が咲きます',
        '春になるとき、桜が咲きます',
      ],
      correctIndex: 0,
    },
  ],
  bossQuestions: [
    {
      type: 'boss',
      subType: 'reading',
      question: {
        type: 'reading',
        passage: '私は子どものとき、田舎に住んでいました。暇なとき、いつも川で泳いだり、山に登ったりしました。春になると、きれいな花がたくさん咲きます。大人になったとき、東京に引っ越しました。寂しいとき、子どものときの写真を見ます。',
        passageZh: '我小时候住在乡下。空闲的时候，总是在河里游泳、爬山。一到春天，很多漂亮的花就开了。长大后，搬到了东京。寂寞的时候，看小时候的照片。',
        question: '筆者が寂しいとき、何をしますか。',
        choices: [
          '川で泳ぎます。',
          '山に登ります。',
          '子どものときの写真を見ます。',
          '田舎に帰ります。',
        ],
        correctIndex: 2,
      },
    },
    {
      type: 'boss',
      subType: 'grammar_check',
      question: {
        type: 'grammar_check',
        prompt: '哪句正确表达"忙的时候不吃早饭"？',
        sentences: [
          '忙しいなとき、朝ごはんを食べません。',
          '忙しいとき、朝ごはんを食べません。',
          '忙しくとき、朝ごはんを食べません。',
        ],
        correctIndex: 1,
        explanation: 'い形容词直接加「とき」，不需要变形也不能加「な」。',
      },
    },
    {
      type: 'boss',
      subType: 'assembly',
      question: {
        type: 'assembly',
        meaning: '一到冬天就下雪。',
        blocks: ['雪が', '冬に', '降ります', 'なると'],
        correctOrder: ['冬に', 'なると', '雪が', '降ります'],
      },
    },
    {
      type: 'boss',
      subType: 'vocab',
      question: {
        type: 'vocab',
        prompt: '困る',
        promptAudio: 'こまる',
        choices: ['高兴', '为难/困扰', '愤怒', '悲伤'],
        correctIndex: 1,
      },
    },
    {
      type: 'boss',
      subType: 'dialogue',
      question: {
        type: 'dialogue',
        context: '日语课上，老师问学生碰到不认识的词怎么办。',
        lines: [
          { speaker: '先生', text: 'わからない言葉があったとき、どうしますか。' },
          { speaker: '学生', text: '___', isBlank: true },
        ],
        choices: [
          'わからない言葉があったとき、辞書で調べます。',
          'わからない言葉があるのとき、辞書で調べます。',
          'わからない言葉があってとき、辞書で調べます。',
        ],
        correctIndex: 0,
      },
    },
    {
      type: 'boss',
      subType: 'reading',
      question: {
        type: 'reading',
        passage: 'この道をまっすぐ行くと、大きい交差点があります。その交差点を右に曲がると、左に白い建物があります。それが郵便局です。',
        passageZh: '沿着这条路一直走，有一个大路口。在那个路口右转，左边有一栋白色建筑。那就是邮局。',
        question: '郵便局はどこにありますか。',
        choices: [
          '交差点の右側',
          '交差点を右に曲がった左側',
          'まっすぐ行った右側',
          '交差点を左に曲がった右側',
        ],
        correctIndex: 1,
      },
    },
    {
      type: 'boss',
      subType: 'grammar_check',
      question: {
        type: 'grammar_check',
        prompt: '以下哪句正确区分了「辞書形＋とき」和「た形＋とき」？',
        sentences: [
          '日本に行くとき、カメラを買いました。（出发前买的）',
          '日本に行ったとき、カメラを買いました。（出发前买的）',
          '日本に行くとき、カメラを買いました。（到了之后买的）',
        ],
        correctIndex: 0,
        explanation: '「行くとき」= 去之前的时间点（还没到），所以"出发前买的"搭配「行くとき」正确。「行ったとき」= 到了之后。',
      },
    },
  ],
};
