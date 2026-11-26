// What the villagers say, and how they sound. Data only: npcs.ts / hud.ts read it. Every fact about Aasish comes
// from the site (lib/site.ts, components/*, app/work/*); the jokes, tea and tall tales are the villagers' own.
// Lines are written to be spoken (Kokoro TTS): short sentences, <= 140 chars, no quotes, dashes or ellipses.

export type Topic = { id: string; ask: string; lines: string[]; link?: string; cta?: string };
export type Script = {
  /** kokoro: the voice for English lines; piper (with pitch, 1 = as recorded) speaks the lines in `spoken` instead */
  id: string; voice: { kokoro: string; speed: number; note: string; piper?: string; pitch?: number }; humour: string;
  greet: string[]; topics: Topic[]; bye: string[]; barks: string[];
  react: { wave: string; bow?: string }; moment?: { label: string; lines: string[] };
  /** what is actually said aloud, by clip key (greet0, topic-<id>-0, bye0, bark0, react-wave...), when it isn't the English
   *  line: Pandit Shankar speaks Nepali and the subtitle shows the English */
  spoken?: Record<string, string>;
};

export const DIALOGUE: Record<string, Script> = {
  genzo: {
    id: 'genzo', voice: { kokoro: 'am_fenrir', speed: 0.9, note: 'Deep, rough older man; slow and flat, every joke delivered like a weather report.' },
    humour: 'Gruff deadpan. Says funny things with a straight face and never admits they were jokes.',
    greet: [
      "Traveller. Stand back from the fire. Further. Good.",
      "Hm. A visitor. Don't touch anything hot. That's everything.",
      "Morning. I'm not much of a talker. So, quickly, what do you want?",
    ],
    topics: [
      { id: 'tools', ask: 'What are you forging?', link: '#work', cta: 'See what he built with them', lines: [
        "Tools for Aasish. Sixteen of them. I counted twice to be sure, and once more because I lost count.",
        "TypeScript and Python. React, Next.js, Node.js and Fastify. PostgreSQL, Prisma and WebSockets.",
        "The OpenAI API, Gemini and OpenRouter. The Gmail API and Apps Script. Playwright and Vitest, to test the edges.",
        "Sixteen blades, each one kept sharp. Go and see what he cut with them.",
      ] },
      { id: 'tests', ask: 'Which tool do you trust most?', lines: [
        "The ones that test the others. Playwright and Vitest. A blade nobody tested is just a hopeful stick.",
        "Aasish runs tests, accessibility audits and failure drills before he calls anything done.",
        "Nova OS alone has a hundred and one test files. I have one test. I hit it. If it rings, it's fine.",
      ] },
      { id: 'who', ask: 'Who is Aasish, anyway?', lines: [
        "An AI engineer from Fort Worth, Texas. Builds agents and automation for teams who can't afford to leak their data.",
        "Works alone, but covers every job a small team would. Like me. Except I also sweep.",
        "Quiet type. Lets the work talk. I respect that. This is the most I've said all year.",
      ] },
      { id: 'advice', ask: 'Any advice for a ronin?', lines: [
        "Keep your blade oiled and your opinions dry.",
        "And don't swing at anything you can't fix afterwards. That one's free. The next one costs.",
      ] },
    ],
    bye: ["Go on. Mind the sparks on the way out.", "Right. Back to hitting things. It's calming."],
    barks: ["Mind the sparks!", "Hot iron. Keep walking.", "Don't lean on that. It's warm. Everything's warm.", "Hm. Nice sandals."],
    react: { wave: "That's a wave. Fine. Here's one back. Don't tell anyone.", bow: "Hm. Manners. Rare round here. I'll allow it." },
    moment: { label: 'Strike the anvil', lines: [
      "Want a go? Fine. Hammer's heavy. Swing down, not at me.",
      "Hm. Sparks went the right way. Nobody lost an eyebrow. That's a good day here.",
      "Not bad. Took me nine years to look this unimpressed. Keep at it.",
    ] },
  },

  hana: {
    id: 'hana', voice: { kokoro: 'af_bella', speed: 1.06, note: 'Bright young woman, quick and breathless, always half laughing.' },
    humour: 'Chatty and teasing. Talks fast, knows everyone\'s gossip, pokes fun at you and herself with a grin.',
    greet: [
      "Oh good, a new face! Hold this. No, wait, give it back. Hello!",
      "Morning! Don't mind the mess, it's organised chaos. Mostly chaos.",
      "You look like someone with a letter to send. No? Everyone has one, they just don't know it yet.",
    ],
    topics: [
      { id: 'hitmen', ask: 'What is Hitmen?', link: '/work/hitmen', cta: 'Read the Hitmen case study', lines: [
        "Only the best helper this post station ever had, and it isn't even a person. Aasish built it.",
        "You tag an email Auto D, it reads the whole thread, picks the tone, and leaves a draft right inside it.",
        "Formal for the invoice, casual for the friend. Then it waits for you to read it and send. It never sends on its own.",
      ] },
      { id: 'tone', ask: 'How does it know the tone?', lines: [
        "It keeps a little profile for each sender. If there isn't one, it reads the keywords, the domain and the message itself.",
        "So a stranger's invoice never gets a cheery hey. Unlike some couriers I could name. Me. I'm the courier.",
      ] },
      { id: 'build', ask: 'How did he build it?', lines: [
        "Twice, on purpose! First in Python on the Gmail API, for full control.",
        "Then as an Apps Script that runs inside Gmail on a schedule. No server to look after. I wish I had that deal.",
        "It skips threads that already have a draft and tidies up its label after. Neater than my desk, honestly.",
      ] },
      { id: 'gossip', ask: 'Any village gossip?', lines: [
        "Genzo smiled once. Last spring. Nobody saw it but me, and he denies everything.",
        "Tokubei says he wrestled a bear. The bear tells it differently. And never ask Sora about the teapot.",
      ] },
    ],
    bye: ["Off you go! Write if you get lost. Actually don't, I'd only have to deliver it.", "Bye! Run, don't dawdle, that's my motto. Well, it's my job."],
    barks: ["Morning! Busy, busy.", "Letters, letters, everywhere!", "Coming through! Mind your toes!", "No time, no time! Hi, though!"],
    react: { wave: "Hi! I'd wave with both hands, but one of them is holding the post.", bow: "Oh, so formal! Shall I draft you a formal reply too?" },
    moment: { label: 'Take the letter', lines: [
      "Oh, wait! This one's for you. Well, it's blank. That's the point.",
      "Write to Aasish about what eats your week, and he'll write back with what an agent could take off your hands.",
      "Go on. I'll run it straight to him, sealed. I'm nosy, but I'm a professional.",
    ] },
  },

  sora: {
    id: 'sora', voice: { kokoro: 'bf_emma', speed: 1.02, note: 'Crisp, clever young woman; speeds up when excited, pauses to enjoy her own puns.' },
    humour: 'Nerdy and pun-happy. Gets excited about mechanisms, then groans at her own jokes.',
    greet: [
      "Careful, that gear is still turning. So am I, mentally. Hello!",
      "Oh, a visitor! Sorry, I'm a bit wound up today. Clockwork joke. You'll get used to them.",
      "Welcome to the workshop. Touch nothing with teeth. The gears, I mean. Not me.",
    ],
    topics: [
      { id: 'nova', ask: 'What are you building?', link: '/work/nova-os', cta: 'Read the Nova OS case study', lines: [
        "A model of something Aasish built. Nova OS, a private workspace where AI does real work, on your own model keys.",
        "He built it alone in three weeks. A hundred and seventy six commits. My kettle takes longer to make up its mind.",
        "Anything that changes something waits for your approval first, with a card showing exactly what will happen.",
        "And your keys are encrypted and never reach the browser. Key security. I'm very proud of that pun.",
      ] },
      { id: 'memory', ask: 'Does it remember things?', lines: [
        "Only what you let it. You tick notes from your own Obsidian vault, and only those are sent.",
        "If a ticked note goes missing, it stops and tells you instead of quietly guessing. Total recall, with manners.",
      ] },
      { id: 'agents', ask: 'What is an agent, really?', lines: [
        "A helper that reads, decides and acts inside the tools you already use, and stops to ask before anything risky.",
        "Here in the lab, agents are tested before they leave. Models, tools, evaluations and guardrails, before anything ships.",
        "Approval steps, audit trails and receipts are built in, not bolted on. I've bolted things on. It ends badly.",
      ] },
      { id: 'break', ask: 'Does it ever break?', lines: [
        "He breaks it on purpose. A provider outage, a restart in the middle of a reply, two tabs at once. Failure drills.",
        "Work runs from a durable queue, up to ten jobs at a time, so a crash never quietly loses anything.",
        "So no, it doesn't fall apart. Unlike my self stirring teapot. It stirred the ceiling.",
      ] },
    ],
    bye: ["Off you go! Keep your wits oiled.", "Bye! Come back when you're ready for more puns. Nobody ever is. Come anyway."],
    barks: ["Careful, the gears are turning.", "Eureka! No, wait. Nearly eureka.", "Who moved my spring? It's always the spring.", "I've had a breakthrough! Mostly through the table."],
    react: { wave: "Hello! I'd wave back, but this spring would hit someone. Consider yourself eyebrow waved.", bow: "A bow! Lovely form. Ninety degrees, roughly. I measured." },
  },

  daisuke: {
    id: 'daisuke', voice: { kokoro: 'am_michael', speed: 0.95, note: 'Steady mid-aged man, clipped and level; the warmth leaks through at the ends of lines.' },
    humour: 'Dry and stern on the outside, soft underneath. Deadpan rules, and quiet kindness he hopes you won\'t notice.',
    greet: [
      "Halt. Hm. Honest eyes. You may pass. Slowly.",
      "State your business. Visiting? Good answer. Nobody ever says that.",
      "Traveller. You're on the path. Correct. Keep doing that.",
    ],
    topics: [
      { id: 'security', ask: 'What are you guarding?', lines: [
        "The castle. And the idea behind it. Aasish trained in ethical hacking at Coventry University.",
        "He learned how walls fall, so he could build them stronger. His degree, he says, is in breaking systems.",
        "Keys stay encrypted, sessions are hardened, and every outbound request is checked. The way I check you. Kindly.",
        "Security is laid with the first stone. Never patched on afterwards. Patches are for trousers.",
      ] },
      { id: 'approve', ask: 'Who decides what gets in?', lines: [
        "A person. Always. In his work, anything that sends, deletes or spends waits for a yes.",
        "Nothing happens behind your back. I approve. I don't like things behind my back either. Hence the wall.",
      ] },
      { id: 'locks', ask: 'What locks does he use?', lines: [
        "In Nova OS, sessions can be revoked, signing in takes two factors, and requests to internal addresses are refused.",
        "One core holds everything sensitive. One place to secure. One gate. Like this one. I'm very fond of it.",
      ] },
      { id: 'dayoff', ask: 'Do you ever get a day off?', lines: [
        "Once. I spent it standing near the gate, to keep an eye on my replacement.",
        "He was fine. Too fine. I didn't trust it. Anyway. Have you eaten? Ochiyo has tea. Go on.",
      ] },
    ],
    bye: ["Go safely. Stay on the path. I'll be watching. Supportively.", "Dismissed. That means goodbye. Look after yourself."],
    barks: ["Keep to the path, traveller.", "Halt. No, carry on. Just practising.", "All quiet. As it should be.", "Walk, don't run. Unless something's chasing you."],
    react: { wave: "A wave. Noted. Returned. Do not make it a habit. A small habit is fine.", bow: "Good form. Back straighter next time. Hm. No, that was fine." },
  },

  yuki: {
    id: 'yuki', voice: { kokoro: 'af_nicole', speed: 0.9, note: 'Soft, airy young woman, close to a whisper; dreamy and unhurried.' },
    humour: 'Whimsical and dreamy. Talks to the wind and the tree, and finds odd little poems in everything.',
    greet: [
      "Shh, listen. Every song carries a little weather. Today's is mostly breeze.",
      "Oh, hello. The petals said someone was coming. They gossip worse than Hana.",
      "You found me. The tree and I were having a quiet argument. She's winning.",
    ],
    topics: [
      { id: 'songs', ask: 'What does Aasish listen to?', lines: [
        "Two songs, on repeat. Still Got the Blues, by Gary Moore. And Dogs, by Pink Floyd.",
        "One sounds like rain on a warm evening. The other is long enough to watch the moon move.",
        "And the board beside me keeps his five songs of the week. I read them to the tree every morning.",
      ] },
      { id: 'play', ask: 'Will you play something?', lines: [
        "Not today. My biwa is sleeping. I never wake an instrument before it's ready.",
        "Besides, the island is already playing. The stream, the wind, the frogs. I'm only the audience.",
      ] },
      { id: 'blues', ask: 'Why the blues?', lines: [
        "I think the blues is sadness that learned to dance. That's only my guess. You'd have to ask him.",
        "And Dogs barks at the world for a long while, then goes quiet and strange. Like a good cat.",
      ] },
      { id: 'tree', ask: 'Who are you talking to?', lines: [
        "The sakura. She's very old and very rude. She drops petals on the people she likes.",
        "There's one on your shoulder. Congratulations. You're in.",
      ] },
    ],
    bye: ["Go gently. The wind will hum you home.", "Goodbye. Leave the petals where they fall. They've had a long day."],
    barks: ["Listen. The wind is in tune today.", "Hmm, hmm, hmm. Oh, that was me.", "The petals say hello. So do I.", "Shh. The tree is thinking."],
    react: { wave: "Oh! A wave. I'll keep it, if that's alright. I collect them.", bow: "A bow! The tree bows back, very slowly. Come back next spring to see it." },
  },

  tokubei: {
    id: 'tokubei', voice: { kokoro: 'bm_fable', speed: 0.95, note: 'Rich old storyteller, British lilt, rolls his words like he is savouring them.' },
    humour: 'Tall tales and wild exaggeration, told with total confidence. Every story grows a little each time.',
    greet: [
      "Sit, sit! The fire is warm and my tales are long. Longer than the fire, usually.",
      "Ah, a listener! The last one stayed three days. Or three hours. It felt like days to him.",
      "Welcome! Have I told you about the time I sneezed a typhoon? No? Sit down.",
    ],
    topics: [
      { id: 'worlds', ask: 'What worlds has Aasish seen?', lines: [
        "Other worlds, traveller! The Lands Between of Elden Ring, where even the trees want a fight.",
        "The rainy rooftops of Arkham Knight's Gotham. And the old West of Red Dead Redemption.",
        "Good worlds make you want to walk a little further. That is what this island is for.",
      ] },
      { id: 'tale', ask: 'Tell me a tale.', lines: [
        "Once I fished a cloud out of the sky with a bent pin. It fed the whole village for a week. Tasted of Tuesday.",
        "Another time a dragon asked me for directions. I sent it to Genzo. He still hasn't forgiven me.",
        "Every word is true. Some of them twice.",
      ] },
      { id: 'island', ask: 'Why does the island float?', lines: [
        "Because I told it a story so exciting, it lifted right off the ground to hear the ending.",
        "I've never told the ending. If I do, we all come down. So I keep adding middles.",
      ] },
      { id: 'true', ask: 'Are your stories true?', lines: [
        "Truer than true! Well. True shaped. They have the outline of the truth, and I colour in the rest.",
        "Good games are the same. Nobody really rode across the West, but you still come back with dust on your boots.",
      ] },
    ],
    bye: ["Off you go! Come back for part two. There are forty parts.", "Farewell! Tell everyone you met the greatest storyteller alive. Modestly, though."],
    barks: ["Come, sit! I have a tale for you.", "Did I tell you about the giant carp? It was this big. Bigger.", "Stories! Fresh stories! Mostly true!", "The fire's warm and so is my voice. Sit!"],
    react: { wave: "A wave! The last one to wave at me was a whale. Lovely fellow. Terrible listener.", bow: "What a bow! An emperor once bowed to me like that. Well, near me. Fine, at a fish behind me." },
  },

  ochiyo: {
    id: 'ochiyo', voice: { kokoro: 'af_heart', speed: 0.92, note: 'Warm older woman, motherly and gently scolding; smiles while she talks.' },
    humour: 'Motherly fussing. Worries you are not eating, scolds you kindly, and teases like a favourite aunt.',
    greet: [
      "Welcome, welcome. Sit and rest your feet. You look thin. Are you eating?",
      "There you are! Out walking in this wind with no hat. Come in, come in.",
      "Oh, a guest! Mind the step, dear. It's older than I am. Only just.",
    ],
    topics: [
      { id: 'write', ask: 'How do I reach Aasish?', link: 'contact', cta: 'Write to Aasish', lines: [
        "Leave him a note, dear. There's a little form. Your name, your email, and a few kind words.",
        "Tell him what eats your week. He'll come back with what an agent could take off your hands.",
        "And what it would cost to build safely. He's careful, that one. I like careful.",
      ] },
      { id: 'what', ask: 'What should I write?', lines: [
        "Whatever you do by hand today that should happen on its own. Inboxes, reports, follow ups. The boring bits.",
        "Don't fuss over the wording. He'll reply by email. Fussing is my job.",
      ] },
      { id: 'tea', ask: 'What tea is this?', lines: [
        "Green tea, from the hill behind the pagoda. Picked by me, dried by me, worried over by me.",
        "Drink it slowly, it's hot. No, slower. There. Doesn't that feel better?",
      ] },
      { id: 'village', ask: 'How is everyone?', lines: [
        "Genzo works too hard. Hana runs too fast. Daisuke stands too long. Somebody has to tell them.",
        "Tokubei talks too much, but he's harmless. And Pandit-ji forgets to eat, so I send tea over the water.",
      ] },
    ],
    bye: ["Off you go. Wrap up warm, and come back hungry.", "Take care, dear. And don't let Hana talk your ear off. Well, one ear."],
    barks: ["The tea is warm, traveller.", "Have you eaten? You haven't. I can tell.", "Mind the step, dear!", "Come in out of the wind!"],
    react: { wave: "Oh, wave all you like, dear. You're still having tea.", bow: "Such manners! Your mother raised you well. Tell her I said so." },
    moment: { label: 'Have some tea', lines: [
      "Sit here on the veranda, dear. The koi like company. Here, both hands, it's hot.",
      "There. Listen to the water. Nobody needs anything from you for a whole cup.",
      "And if something's been eating your week, you could tell Aasish. After the tea. Tea always comes first.",
    ] },
  },

  shankar: {
    id: 'shankar', voice: { kokoro: 'hm_omega', speed: 0.92, piper: 'ne_NP-chitwan-medium', pitch: 0.92, note: 'Elderly Nepali priest speaking Nepali: unhurried, kindly, a chuckle never far away.' },
    humour: 'A cheeky, fatherly old pandit. Teases you like a grandson, bargains with the gods, and laughs at his own jokes first.',
    greet: [
      "Come, come. Sit. Shiva-ji has been dancing since morning. I only keep the lamp lit.",
      "Oho, a visitor! You crossed the rope bridge? Good. The gods like brave knees.",
      "Namaste, babu. You're just in time. The flowers are fresh and my jokes are old.",
    ],
    topics: [
      { id: 'mountains', ask: 'What does Aasish love?', lines: [
        "The mountains. High passes, wildlife, and the Himalaya above all.",
        "Up there, a long climb is only many small steps. He says it is where he would rather be.",
        "Shiva-ji lives on Kailash, in the Himalaya. So Aasish and Shiva-ji like the same address. Good taste, both.",
      ] },
      { id: 'statue', ask: 'Who is the stone dancer?', lines: [
        "That is Nataraja. Shiva as the lord of the dance, inside a ring of fire.",
        "With one foot he dances the world into being. The other is lifted, to show the way out of sorrow.",
        "And his raised hand says, do not be afraid. I tell the pigeons this too. They don't listen.",
      ] },
      { id: 'aarti', ask: 'What is the lamp for?', lines: [
        "That is aarti. I circle the lamp before him, ring the little bell, and offer flowers and water.",
        "Light for the eyes, sound for the ears, flowers for the nose. The gods are very choosy guests.",
        "The water is poured over the lingam and runs off down the spout. Like worries. Like my hair.",
      ] },
      { id: 'blessing', ask: 'Will you bless me?', lines: [
        "Why not. May your road always be safe, your knees strong, and your tea always hot.",
        "Ochiyo sends me tea, you know. Flowers for Shiva-ji, tea for me. Everybody is happy.",
      ] },
    ],
    bye: ["Go well, babu. And come back before the flowers wilt.", "Har Har Mahadev. Mind the bridge. It wobbles, but it means well."],
    barks: ["Om Namah Shivaya.", "Slowly, slowly. The mountain isn't running away.", "Come, take a flower. Just one.", "The lamp is lit. All is well."],
    react: { wave: "Oho, you wave like a cricket fan. Very good. Namaste to you too.", bow: "Such manners! Your mother raised you well. Namaste, namaste." },
    spoken: {
      greet0: 'आऊ, आऊ। बस। शिवजी बिहानदेखि नाच्दै हुनुहुन्छ। म त दियो बालिराख्छु मात्र।',
      greet1: 'ओहो, पाहुना! डोरीको पुल तरेर आयौ? राम्रो। भगवानलाई साहसी घुँडा मन पर्छ।',
      greet2: 'नमस्ते बाबु। ठीक समयमा आइपुग्यौ। फूलहरू ताजा छन्, मेरा ठट्टा पुराना।',
      'topic-mountains-0': 'हिमाल। अग्ला भञ्ज्याङ, वन्यजन्तु, र सबैभन्दा माथि हिमालय।',
      'topic-mountains-1': 'त्यहाँ माथि, लामो उकालो भनेको धेरै साना पाइलाहरू मात्र हो। उनी भन्छन्, त्यहीँ हुन मन लाग्छ।',
      'topic-mountains-2': 'शिवजी त हिमालयको कैलाशमा बस्नुहुन्छ। त्यसैले आसिश र शिवजीलाई एउटै ठेगाना मन पर्छ। दुवैको रुचि राम्रो।',
      'topic-statue-0': 'उहाँ नटराज हुनुहुन्छ। आगोको घेराभित्र नाच्ने, नृत्यका देवता शिवजी।',
      'topic-statue-1': 'एउटा खुट्टाले उहाँ नाचेर संसार बनाउनुहुन्छ। अर्को उचालिएको छ, दुःखबाट निस्कने बाटो देखाउन।',
      'topic-statue-2': 'अनि उठेको हातले भन्छ, नडराऊ। यो कुरा म परेवाहरूलाई पनि भन्छु। तिनीहरू सुन्दैनन्।',
      'topic-aarti-0': 'त्यो आरती हो। म उहाँको अगाडि दियो घुमाउँछु, सानो घण्टी बजाउँछु, अनि फूल र जल चढाउँछु।',
      'topic-aarti-1': 'आँखाका लागि उज्यालो, कानका लागि आवाज, नाकका लागि फूल। भगवान् बडो छान्ने पाहुना हुनुहुन्छ।',
      'topic-aarti-2': 'जल शिवलिङ्गमाथि खन्याइन्छ, अनि धारोबाट बगेर जान्छ। चिन्ता जस्तै। मेरो कपाल जस्तै।',
      'topic-blessing-0': 'किन नहुनु। तिम्रो बाटो सधैं सुरक्षित होस्, घुँडा बलियो होस्, अनि चिया सधैं तातो होस्।',
      'topic-blessing-1': 'ओचियोले मलाई चिया पठाउँछिन् नि। शिवजीलाई फूल, मलाई चिया। सबै खुसी।',
      bye0: 'राम्ररी जाऊ बाबु। फूल ओइलाउनुअघि फेरि आऊ है।',
      bye1: 'हर हर महादेव। पुलमा होस गर। हल्लिन्छ, तर नियत राम्रो छ।',
      bark0: 'ॐ नमः शिवाय।', bark1: 'बिस्तारै, बिस्तारै। हिमाल कतै भाग्दैन।', bark2: 'आऊ, एउटा फूल लेऊ। एउटा मात्र।', bark3: 'दियो बलेको छ। सबै ठीक छ।',
      'react-wave': 'ओहो, क्रिकेटको फ्यानले जस्तै हात हल्लायौ। राम्रो। तिमीलाई पनि नमस्ते।',
      'react-bow': 'कति राम्रो संस्कार! आमाले राम्ररी हुर्काउनुभएछ। नमस्ते, नमस्ते।',
    },
  },
};
