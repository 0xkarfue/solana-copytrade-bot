import { Keypair } from "@solana/web3.js";
import { Bot, InlineKeyboard } from "grammy";
import { PrismaClient } from "./generated/prisma";

const prisma = new PrismaClient();

const token = process.env.TELEGRAM_BOT_TOKEN!;

const bot = new Bot(token);

const inlineKeyboard = new InlineKeyboard()
    .text("Public Key", "public")
    .text("Private Key", "private");

bot.command("start", async (ctx) => {

    const keypair = Keypair.generate()

    const existing = await prisma.user.findFirst({
        where: {
            tgUserId: ctx.chatId.toString()
        }
    })

    if (existing) {
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

bot.start()