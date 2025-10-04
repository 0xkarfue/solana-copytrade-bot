import { Keypair } from "@solana/web3.js";
import { Bot, InlineKeyboard } from "grammy";
import { PrismaClient } from "./generated/prisma";
import { getBalanceMessage } from "../getBalance";

const prisma = new PrismaClient();

const token = process.env.TELEGRAM_BOT_TOKEN!;

const bot = new Bot(token);

const inlineKeyboard = new InlineKeyboard()
    .text("Public Key", "public")
    .text("Private Key", "private")
    .text("Copy trade", "copyTrade")
    .text("Trade", "trade");

const solOptions = new InlineKeyboard()
    .text("0.01", "first")
    .text("0.05", "second");

// const copyTradeKeyboard = new InlineKeyboard()
//     .text("wallet", "copywalletadd")

bot.command("start", async (ctx) => {

    const keypair = Keypair.generate()

    const existing = await prisma.user.findFirst({
        where: {
            tgUserId: ctx.chatId.toString()
        }
    })

    if (existing) {
        const balance = await getBalanceMessage(keypair.publicKey.toBase58())
        ctx.reply(balance.message)
        return ctx.reply("already have wallet", {
            reply_markup: inlineKeyboard
        })
    }

    await prisma.user.create({
        data: {
            tgUserId: ctx.chatId.toString(),
            privateKey: keypair.secretKey.toBase64(),
            publicKey: keypair.publicKey.toBase58()
        }
    })

    const balance = await getBalanceMessage(keypair.publicKey.toBase58())
    ctx.reply(balance.message)

    return ctx.reply("hello dude!", {
        reply_markup: inlineKeyboard
    });
})

bot.callbackQuery("public", async (ctx) => {

    const publicKey = await prisma.user.findFirst({
        where: {
            tgUserId: ctx.chatId?.toString()
        },
        select: {
            publicKey: true
        }
    })

    ctx.reply(`Public Key == ${publicKey?.publicKey}`)
})

bot.callbackQuery("private", async (ctx) => {

    const privateKey = await prisma.user.findFirst({
        where: {
            tgUserId: ctx.chatId?.toString()
        },
        select: {
            privateKey: true
        }
    })

    ctx.reply(`Private Key == ${privateKey?.privateKey}`)

})


bot.callbackQuery("trade", async (ctx) => {
    await ctx.reply("Please enter the token name:");
    await ctx.answerCallbackQuery();
});


bot.on("message:text", async (ctx) => {
    const token = ctx.message.text;
    await ctx.reply(`Token: ${token}`);

    return ctx.reply("Amount", {
        reply_markup: solOptions
    })
});




// bot.callbackQuery("copyTrade", async (ctx) => {
//     ctx.reply("Copy Trade", { reply_markup: copyTradeKeyboard })
// })

bot.start()