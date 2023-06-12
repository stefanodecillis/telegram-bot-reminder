const TelegramBot = require('node-telegram-bot-api');
var MongoClient = require('mongodb').MongoClient;
const cron = require('node-cron');

const telegramChatID = parseInt(process.env.TELEGRAM_CHAT_ID);

var url = process.env.MONGO_URL;

const netflixUsers = process.env.NETFLIX_USERS.split(',');
const spotifyUsers = process.env.SPOTIFY_USERS.split(',');

// users who don't want to be notified since they own the service
const netflixExcludedUsers = process.env.NETFLIX_USERS_EXCLUDE.split(',');
const spotifyExcludedUsers = process.env.SPOTIFY_USERS_EXCLUDE.split(',');

/**
 * Stickers
 */
const stickers = ['CAACAgIAAxkBAAM2ZAPLi7SqvExgQbAYd8d7EE-rDngAAn0LAAIMqGFLZzTxx5i013IuBA', 'CAACAgIAAxkBAANMZAPOZhtR15E2q_ke0mqoKO4Ut0gAApMOAAIEBIFIHam9yNTXKaYuBA', 'CAACAgIAAxkBAANNZAPOf5YgGdtw63i6Trt2rPsyWCYAAmcLAAL2hGFLjwRLnTnReqIuBA']
const awarenessStickers = ['CAACAgIAAxkBAANdZAPPwOFMUY8n_mJyMHxjSv8ulXYAAlwMAAJ8Z4hLqkZUJ9Zz6tsuBA', 'CAACAgUAAxkBAANyZATmp-KNXRlKQeLEPLTnbKs-EbkAAv0EAALQAdlXP17OH_XzXX4uBA', 'CAACAgUAAxkBAANzZATm5qziP3A6un6xjTRedJ3X0XMAAgkEAALHw3lUjKASq5URxKEuBA', 'CAACAgUAAxkBAAN0ZATnFbKrwHWG1S_0VdbMP2VgvLIAAsUEAAJrZxhUQ9NJ8Juixw4uBA']

const Service = {
    NETFLIX: 'netflix',
    SPOTIFY: 'spotify'
}

class Payment {
    constructor(user, service, date = Date.now()) {
        this.user = user;
        this.service = service;
        this.date = date;
    }
}

// replace the value below with the Telegram token you receive from @BotFather
const token = process.env.TELEGRAM_BOT_TOKEN;

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, {
    polling: true,
});

async function main() {
    const mongo = await MongoClient.connect(url);

    const paymentsCollection = mongo.db('botdb').collection('payments');

    bot.onText(/\/netflix/, async (msg, match) => {
        const chatId = msg.chat.id;
        const result = await findWhoHasToPay(paymentsCollection)

        if (result.netflixUsersWhoHasToPay) {
            //verify that the user is the one who has to pay
            if (result.netflixUsersWhoHasToPay === msg.from.first_name) {
                insertPayment(paymentsCollection, msg.from.first_name, Service.NETFLIX);
                bot.sendMessage(chatId, "Brav' " + msg.from.first_name + " hai pagato Netflix!");
                bot.sendSticker(chatId, randomSticker(stickers));
            } else {
                bot.sendMessage(chatId, "Non è il tuo turno di pagare!");
            }
        } else {
            bot.sendMessage(chatId, "Sta già pagato!");
        }
    });

    bot.onText(/\/spotify/, async (msg, match) => {

        const chatId = msg.chat.id;

        const result = await findWhoHasToPay(paymentsCollection)

        if (result.spotifyUsersWhoHasToPay) {
            //verify that the user is the one who has to pay
            if (result.spotifyUsersWhoHasToPay === msg.from.first_name) {
                insertPayment(paymentsCollection, msg.from.first_name, Service.SPOTIFY);
                bot.sendMessage(chatId, "Brav' " + msg.from.first_name + " hai pagato Spotify!");
                bot.sendSticker(chatId, randomSticker(stickers));
            } else {
                bot.sendMessage(chatId, "Non è il tuo turno di pagare!");
            }
        } else {
            bot.sendMessage(chatId, "Sta già pagato!");
        }
    });

    // bot.on('message', async (msg) => {
    //     // 'msg' is the received Message from Telegram
    //     // 'match' is the result of executing the regexp above on the text content
    //     // of the message

    //     const chatId = msg.chat.id;


    //     console.log('msg', msg.sticker.file_id);
    // });

    // every four days at 19:30   
    cron.schedule('30 19 */4 * *', function () {
        findWhoHasToPay(paymentsCollection).then(async (result) => {
            const { netflixUsersWhoHasToPay, spotifyUsersWhoHasToPay } = result;
            console.log('computing')
            console.log(netflixUsersWhoHasToPay, spotifyUsersWhoHasToPay)

            if (netflixUsersWhoHasToPay || spotifyUsersWhoHasToPay) {
                // catch the case where users already paid since it owns the service
                const morePayers = await autoPayOwners(paymentsCollection, netflixUsersWhoHasToPay, spotifyUsersWhoHasToPay);
                if (!morePayers) return;
                await bot.sendSticker(telegramChatID, randomSticker(awarenessStickers));
            }
            if (netflixUsersWhoHasToPay && !netflixExcludedUsers.includes(netflixUsersWhoHasToPay))
                await bot.sendMessage(telegramChatID, `Ricordati <strong>${netflixUsersWhoHasToPay}</strong> di pagare Netflix 📺`, { parse_mode: "HTML" });
            if (spotifyUsersWhoHasToPay && !spotifyExcludedUsers.includes(spotifyUsersWhoHasToPay))
                await bot.sendMessage(telegramChatID, `Ricordati <strong>${spotifyUsersWhoHasToPay}</strong> di pagare Spotify 🎧`, { parse_mode: "HTML" });
        })
    });
}

async function insertPayment(paymentsCollection, user, service) {
    const payment = new Payment(user, service);
    await paymentsCollection.insertOne(payment);
}

async function autoPayOwners(paymentsCollection, netflixUser, spotifyUser) {
    let owners = 0;
    if (netflixUser && netflixExcludedUsers.includes(netflixUser)) {
        await insertPayment(paymentsCollection, netflixUser, Service.NETFLIX);
        owners++;
    }

    if (spotifyUser && spotifyExcludedUsers.includes(spotifyUser)) {
        await insertPayment(paymentsCollection, spotifyUser, Service.SPOTIFY);
        owners++;
    }

    return owners < 2;
}

isIncludedInArray = (array, element) => {
    for (let i = 0; i < array.length; i++) {
        if (array[i] === element) {
            return true;
        }
    }
    return false;
}

function randomSticker(stickers) {
    // selecting a random sticker
    const randomSticker = stickers[Math.floor(Math.random() * Math.floor(Math.random() * stickers.length))];
    return randomSticker;
}

// find who has to pay
async function findWhoHasToPay(paymentsCollection) {
    const currentMonthDate = new Date();
    currentMonthDate.setDate(1);
    const netflixPayments = await paymentsCollection.find({ service: Service.NETFLIX }).sort({ date: -1 }).limit(netflixUsers.length - 1).toArray();
    const spotifyPayments = await paymentsCollection.find({ service: Service.SPOTIFY }).sort({ date: -1 }).limit(spotifyUsers.length - 1).toArray();

    // check if someone has already paid this month
    const netflixUsersWhoHasAlreadyPaid = netflixPayments.filter(payment => new Date(payment.date).getMonth() == currentMonthDate.getMonth());
    const spotifyUsersWhoHasAlreadyPaid = spotifyPayments.filter(payment => new Date(payment.date).getMonth() == currentMonthDate.getMonth());
    let result = {};

    if (!netflixUsersWhoHasAlreadyPaid.length) {
        const netflixUsersSet = netflixPayments.map(payment => payment.user);
        const netflixUsersWhoHasToPay = netflixUsers.filter(user => !isIncludedInArray(netflixUsersSet, user))[0];
        result.netflixUsersWhoHasToPay = netflixUsersWhoHasToPay;
    }

    if (!spotifyUsersWhoHasAlreadyPaid.length) {
        const spotifyUsersSet = spotifyPayments.map(payment => payment.user);
        const spotifyUsersWhoHasToPay = spotifyUsers.filter(user => !isIncludedInArray(spotifyUsersSet, user))[0];
        result.spotifyUsersWhoHasToPay = spotifyUsersWhoHasToPay;
    }

    return result
}

main().catch(err => console.error(err));
console.log('running ✨')