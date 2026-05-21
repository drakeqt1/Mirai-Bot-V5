const bold = require('../../utils/bold');

module.exports.config = {
    name: "leaveNoti",
    eventType: ["log:unsubscribe"],
    version: "1.0.2",
    credits: "Ranz",
    description: "Notify when a user leaves the group",
};

module.exports.onLoad = function () {
    const { existsSync, mkdirSync } = require("fs-extra");
    const { join } = require("path");
    const p1 = join(__dirname, "cache", "leaveGif");
    const p2 = join(__dirname, "cache", "leaveGif", "randomgif");
    if (!existsSync(p1)) mkdirSync(p1, { recursive: true });
    if (!existsSync(p2)) mkdirSync(p2, { recursive: true });
};

module.exports.run = async function ({ api, event, Users, Threads }) {
    try {
        const { threadID } = event;
        const iduser = event.logMessageData.leftParticipantFbId;
        if (iduser == api.getCurrentUserID()) return;

        const moment = require("moment-timezone");
        const time = moment.tz("Asia/Manila").format("hh:mm A | MMM D YYYY");
        const threadRecord = await Threads.getData(threadID);
        const data = global.data.threadData.get(parseInt(threadID)) || (threadRecord ? threadRecord.data : {});
        const userData = await Users.getData(event.author);
        const nameAuthor = userData?.name || "";
        const name = global.data.userName.get(iduser) || await Users.getNameUser(iduser);

        const type = (event.author == iduser)
            ? `👋 left the group`
            : `🦶 was kicked by ${nameAuthor}`;

        var msg = data?.customLeave ||
            `╔══════════════════╗\n║  🚪 ${bold('MEMBER LEFT')}   ║\n╚══════════════════╝\n\n` +
            `👤 ${bold('{name}')}\n{type}\n\n` +
            `🔗 fb.com/profile.php?id={iduser}\n⏰ {time}`;

        msg = msg
            .replace(/\{name}/g, name)
            .replace(/\{type}/g, type)
            .replace(/\{iduser}/g, iduser)
            .replace(/\{author}/g, nameAuthor)
            .replace(/\{time}/g, time);

        return api.sendMessage(msg, threadID);
    } catch (e) {
        console.log(e);
    }
};
