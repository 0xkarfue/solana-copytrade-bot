import { Keypair, LAMPORTS_PER_SOL, Connection, VersionedTransaction } from "@solana/web3.js";
import { Bot, InlineKeyboard } from "grammy";
import { PrismaClient } from "./generated/prisma";
import { getBalanceMessage } from "../getBalance";
import { swap } from "../swap";
import { isValidToken } from "../utils/isValid";

const prisma = new PrismaClient();
const token = process.env.TELEGRAM_BOT_TOKEN!;
const bot = new Bot(token);
const connection = new Connection(process.env.RPC_URL!);

const userTokens: Record<string, string> = {};

const inlineKeyboard = new InlineKeyboard()
  .text("🔑 Public Key", "public")
  .text("🔄 Refresh", "refresh")
  .text("🕵️ Private Key", "private")
  .row()
  .text("🤝 Copy Trade", "copyTrade")
  .text("💱 Trade", "trade")
  .row();

const solOptions = new InlineKeyboard()
  .text("0.01 SOL", "first")
  .text("0.05 SOL", "second")
  .row();


bot.command("start", async (ctx) => {
  const existing = await prisma.user.findFirst({
    where: { tgUserId: ctx.chatId.toString() }
  });

  if (existing) {
    const balance = await getBalanceMessage(existing.publicKey);
    return ctx.reply(
      `⚠️ *Wallet Already Exists!*\n\n📬 *Address:* \`${existing.publicKey}\`\n💰 *Balance:* ${balance.message}`,
      {
        parse_mode: "Markdown",
        reply_markup: inlineKeyboard
      }
    );
  }

  const keypair = Keypair.generate();

  await prisma.user.create({
    data: {
      tgUserId: ctx.chatId.toString(),
      privateKey: Buffer.from(keypair.secretKey).toString("base64"),
      publicKey: keypair.publicKey.toBase58()
    }
  });

  const balance = await getBalanceMessage(keypair.publicKey.toBase58());

  return ctx.reply(
    `👋 *Welcome to Echo!*\n\n📬 *Your Address:* \`${keypair.publicKey.toBase58()}\`\n💰 *Balance:* ${balance.message}`,
    {
      parse_mode: "Markdown",
      reply_markup: inlineKeyboard
    }
  );
});

bot.callbackQuery("public", async (ctx) => {
  const user = await prisma.user.findFirst({
    where: { tgUserId: ctx.chatId?.toString() },
    select: { publicKey: true }
  });
  await ctx.answerCallbackQuery();
  await ctx.reply(`🔓 *Public Key:*\n\`${user?.publicKey}\``, { parse_mode: "Markdown" });
});

bot.callbackQuery("private", async (ctx) => {
  const user = await prisma.user.findFirst({
    where: { tgUserId: ctx.chatId?.toString() },
    select: { privateKey: true }
  });
  await ctx.answerCallbackQuery();
  await ctx.reply(`🔐 *Private Key:*\n\`${user?.privateKey}\``, { parse_mode: "Markdown" });
});


bot.callbackQuery("refresh", async (ctx) => {
  const user = await prisma.user.findFirst({
    where: { tgUserId: ctx.chatId?.toString() }
  });

  if (!user) {
    await ctx.answerCallbackQuery();
    return ctx.reply("❌ *User not found.*\nUse /start to create your wallet again.", { parse_mode: "Markdown" });
  }

  const balance = await getBalanceMessage(user.publicKey);
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `📬 *Address:* \`${user.publicKey}\`\n💰 *Balance:* ${balance.message}`,
    { parse_mode: "Markdown", reply_markup: inlineKeyboard }
  );
});


bot.callbackQuery("trade", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("💡 *Please enter the Token Address:*", { parse_mode: "Markdown" });
});

bot.on("message:text", async (ctx) => {
  const tokenMint = ctx.message.text;
  const isValid = await isValidToken(tokenMint);

  if (isValid) {
    userTokens[ctx.chatId.toString()] = tokenMint;
    return ctx.reply("💰 *Enter the amount you want to trade:*", {
      parse_mode: "Markdown",
      reply_markup: solOptions
    });
  }

  return ctx.reply("⚠️ *Invalid Token Address!*", { parse_mode: "Markdown" });
});


async function handleSwap(ctx: any, amountSol: number) {
  try {
    const user = await prisma.user.findFirst({
      where: { tgUserId: ctx.chatId?.toString() }
    });

    if (!user) {
      await ctx.answerCallbackQuery();
      return ctx.reply("❌ *User not found.* Please use /start", { parse_mode: "Markdown" });
    }

    const tokenMint = userTokens[ctx.chatId?.toString() || ""];
    if (!tokenMint) {
      await ctx.answerCallbackQuery();
      return ctx.reply("⚠️ *No token selected.* Please start trade again.", { parse_mode: "Markdown" });
    }

    await ctx.answerCallbackQuery();
    await ctx.reply("🔄 *Processing swap...*", { parse_mode: "Markdown" });

    const swapTxn = await swap(
      "So11111111111111111111111111111111111111112",
      tokenMint,
      amountSol * LAMPORTS_PER_SOL,
      user.publicKey
    );


    const secretKeyArray = Uint8Array.from(Buffer.from(user.privateKey, "base64"));
    const userKeypair = Keypair.fromSecretKey(secretKeyArray);

    const tx = VersionedTransaction.deserialize(
      Uint8Array.from(Buffer.from(swapTxn, "base64"))
    );

    tx.sign([userKeypair]);
    const signature = await connection.sendTransaction(tx);

    delete userTokens[ctx.chatId?.toString() || ""];

    await ctx.reply(
      `✅ *Swap Successful!*\n\n💰 *Amount:* ${amountSol} SOL\n🔗 [View Transaction](https://solscan.io/tx/${signature})`,
      { parse_mode: "Markdown", reply_markup: inlineKeyboard }
    );
  } catch (error) {
    console.error("Swap error:", error);
    await ctx.reply("❌ *Error while performing swap.* Please try again.", { parse_mode: "Markdown" });
    if (ctx.chatId) delete userTokens[ctx.chatId.toString()];
  }
}

bot.callbackQuery("first", async (ctx) => handleSwap(ctx, 0.01));
bot.callbackQuery("second", async (ctx) => handleSwap(ctx, 0.05));

bot.start();






