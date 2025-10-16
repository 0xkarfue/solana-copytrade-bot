import { Keypair, LAMPORTS_PER_SOL, Connection, VersionedTransaction } from "@solana/web3.js";
import { Bot, InlineKeyboard } from "grammy";
import { PrismaClient } from "./generated/prisma";
import { getBalanceMessage } from "../getBalance";
import { swap } from "../swap";
import { isValidToken } from "../utils/isValid";
import { getUserTokens } from "../utils/getUserToken";

const prisma = new PrismaClient();
const token = process.env.TELEGRAM_BOT_TOKEN!;
const bot = new Bot(token);
const connection = new Connection(process.env.RPC_URL!);

// Store user state (token, action type, amount, decimals)
const userState: Record<string, {
  tokenMint?: string;
  action?: "buy" | "sell";
  tokenAmount?: number;
  tokenDecimals?: number;
}> = {};

const inlineKeyboard = new InlineKeyboard()
  .text("🔑 Public Key", "public")
  .text("🔄 Refresh", "refresh")
  .text("🕵️ Private Key", "private")
  .row()
  .text("🤝 Copy Trade", "copyTrade")
  .text("💱 Trade", "trade")
  .row();

const buyOptions = new InlineKeyboard()
  .text("0.01 SOL", "buy_0.01")
  .text("0.05 SOL", "buy_0.05")
  .row();

const tradeOptions = new InlineKeyboard()
  .text("Buy", "buy")
  .text("Sell", "sell");

const sellOptions = new InlineKeyboard()
  .text("10%", "sell_10")
  .text("25%", "sell_25")
  .text("50%", "sell_50")
  .row()
  .text("100%", "sell_100");

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
  await ctx.reply("Trade", { reply_markup: tradeOptions });
});

// BUY FLOW
bot.callbackQuery("buy", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.chatId) return;
  userState[ctx.chatId.toString()] = { action: "buy" };
  await ctx.reply("💡 *Please enter the Token Address:*", { parse_mode: "Markdown" });
});

// SELL FLOW
bot.callbackQuery("sell", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.chatId) return;
  userState[ctx.chatId.toString()] = { action: "sell" };
  await ctx.reply("💡 *Please enter the Token Address:*", { parse_mode: "Markdown" });
});

// SINGLE message handler - handles BOTH buy and sell
bot.on("message:text", async (ctx) => {
  const chatId = ctx.chatId.toString();
  const tokenMint = ctx.message.text;

  const state = userState[chatId];

  if (!state || !state.action) {
    return; // Ignore messages not part of trade flow
  }

  const isValid = await isValidToken(tokenMint);

  if (!isValid) {
    return ctx.reply("⚠️ *Invalid Token Address!*", { parse_mode: "Markdown" });
  }

  // ✅ FIXED: Check if state exists before assigning
  if (!userState[chatId]) {
    userState[chatId] = {};
  }
  userState[chatId].tokenMint = tokenMint;

  if (state.action === "buy") {
    // BUY: Show SOL amount options
    return ctx.reply("💰 *Enter the amount you want to trade:*", {
      parse_mode: "Markdown",
      reply_markup: buyOptions
    });
  } else if (state.action === "sell") {
    // SELL: Check if user holds token
    const user = await prisma.user.findFirst({
      where: { tgUserId: chatId },
      select: { publicKey: true }
    });

    if (!user) {
      delete userState[chatId];
      return ctx.reply("❌ *User not found.*", { parse_mode: "Markdown" });
    }

    const tokens = await getUserTokens(user.publicKey);
    const match = tokens.find((t) => t.mint === tokenMint);

    if (!match) {
      delete userState[chatId];
      return ctx.reply("❌ You don't hold this token in your wallet.");
    }

    // ✅ FIXED: Ensure state exists before assigning
    if (!userState[chatId]) {
      userState[chatId] = {};
    }
    userState[chatId].tokenAmount = match.amount;
    userState[chatId].tokenDecimals = match.decimals;

    return ctx.reply(`✅ You hold *${match.amount}* of token:\n\`${match.mint}\`\n\nSelect percentage to sell:`, {
      parse_mode: "Markdown",
      reply_markup: sellOptions
    });
  }
});

// BUY callbacks
bot.callbackQuery(/^buy_(.+)$/, async (ctx) => {
  const match = ctx.match;
  if (!match || typeof match === 'string') return;

  const amount = parseFloat(match[1]!); // ✅ Now we're sure match[1] exists
  await handleBuy(ctx, amount);
});

// SELL callbacks
bot.callbackQuery(/^sell_(.+)$/, async (ctx) => {
  const match = ctx.match;
  if (!match || typeof match === 'string') return;

  const percentage = parseInt(match[1]!); // ✅ Now we're sure match[1] exists
  await handleSell(ctx, percentage);
});


async function handleBuy(ctx: any, amountSol: number) {
  try {
    const chatId = ctx.chatId?.toString();
    if (!chatId) return;

    const user = await prisma.user.findFirst({
      where: { tgUserId: chatId }
    });

    if (!user) {
      await ctx.answerCallbackQuery();
      return ctx.reply("❌ *User not found.* Please use /start", { parse_mode: "Markdown" });
    }

    const tokenMint = userState[chatId]?.tokenMint;
    if (!tokenMint) {
      await ctx.answerCallbackQuery();
      return ctx.reply("⚠️ *No token selected.* Please start trade again.", { parse_mode: "Markdown" });
    }

    await ctx.answerCallbackQuery();
    await ctx.reply("🔄 *Processing buy...*", { parse_mode: "Markdown" });

    // BUY: SOL → Token
    const swapTxn = await swap(
      "So11111111111111111111111111111111111111112", // Input: SOL
      tokenMint, // Output: Token
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

    delete userState[chatId];

    await ctx.reply(
      `✅ *Buy Successful!*\n\n💰 *Amount:* ${amountSol} SOL\n🔗 [View Transaction](https://solscan.io/tx/${signature})`,
      { parse_mode: "Markdown", reply_markup: inlineKeyboard }
    );
  } catch (error) {
    console.error("Buy error:", error);
    await ctx.reply("❌ *Error while buying.* Please try again.", { parse_mode: "Markdown" });
    if (ctx.chatId) delete userState[ctx.chatId.toString()];
  }
}

async function handleSell(ctx: any, percentage: number) {
  try {
    const chatId = ctx.chatId?.toString();
    if (!chatId) return;

    const user = await prisma.user.findFirst({
      where: { tgUserId: chatId }
    });

    if (!user) {
      await ctx.answerCallbackQuery();
      return ctx.reply("❌ *User not found.* Please use /start", { parse_mode: "Markdown" });
    }

    const state = userState[chatId];
    if (!state?.tokenMint || state.tokenAmount === undefined || state.tokenDecimals === undefined) {
      await ctx.answerCallbackQuery();
      return ctx.reply("⚠️ *No token selected.* Please start trade again.", { parse_mode: "Markdown" });
    }

    await ctx.answerCallbackQuery();
    await ctx.reply(`🔄 *Processing sell (${percentage}%)...*`, { parse_mode: "Markdown" });

    // Calculate amount to sell
    const amountToSell = state.tokenAmount * (percentage / 100);

    // Use token decimals instead of LAMPORTS_PER_SOL
    const amountInSmallestUnit = Math.floor(amountToSell * Math.pow(10, state.tokenDecimals));

    // SELL: Token → SOL
    const swapTxn = await swap(
      state.tokenMint, // Input: Token
      "So11111111111111111111111111111111111111112", // Output: SOL
      amountInSmallestUnit,
      user.publicKey
    );

    const secretKeyArray = Uint8Array.from(Buffer.from(user.privateKey, "base64"));
    const userKeypair = Keypair.fromSecretKey(secretKeyArray);

    const tx = VersionedTransaction.deserialize(
      Uint8Array.from(Buffer.from(swapTxn, "base64"))
    );

    tx.sign([userKeypair]);
    const signature = await connection.sendTransaction(tx);

    delete userState[chatId];

    await ctx.reply(
      `✅ *Sell Successful!*\n\n💰 *Sold:* ${percentage}% (${amountToSell.toFixed(4)} tokens)\n🔗 [View Transaction](https://solscan.io/tx/${signature})`,
      { parse_mode: "Markdown", reply_markup: inlineKeyboard }
    );
  } catch (error) {
    console.error("Sell error:", error);
    await ctx.reply("❌ *Error while selling.* Please try again.", { parse_mode: "Markdown" });
    if (ctx.chatId) delete userState[ctx.chatId.toString()];
  }
}

bot.start();