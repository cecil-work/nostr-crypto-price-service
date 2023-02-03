"use strict";
import "websocket-polyfill";

import {
  relayInit,
  generatePrivateKey,
  getPublicKey,
  getEventHash,
  signEvent,
  nip19,
  Event,
  validateEvent,
  verifySignature,
  Relay,
  Kind,
} from "nostr-tools";
import meow from "meow";
import ccxt from "ccxt";
import dayjs from "dayjs";
import { CronJob } from "cron";

async function connectRelay(prikey: string) {
  const relay = relayInit("wss://no-str.org");
  await relay.connect();
  return relay;
}
function publishTextNote(
  kind: Kind,
  content: string,
  relay: Relay,
  prikey: string,
  pubkey: string
) {
  let event: Event = {
    kind: kind,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: content,
    pubkey: pubkey,
  };
  event.id = getEventHash(event);
  event.sig = signEvent(event, prikey);
  const isValidate = validateEvent(event);
  if (event.sig) {
    const isVerify = verifySignature(event as any);

    if (isValidate && isVerify) {
      relay.publish(event);
    }
  }
  relay.publish(event).on("ok", () => {
    console.log(`${kind}\t${content}`);
  });
}

async function start({ prikey: prikeyNS }: { prikey: string }) {
  const { type, data } = nip19.decode(prikeyNS);

  if (type !== "nsec") {
    console.log(`prikey:${prikeyNS} not a nip19 nsec key`);
    return;
  }

  const prikey = data.toString();
  const pubkey = getPublicKey(prikey);
  const pubkeyNP = nip19.npubEncode(pubkey);

  console.log(`your public key is: ${pubkeyNP}`);

  const relay = await connectRelay(prikey);

  relay.on("connect", () => {
    console.log(`connected to ${relay.url}`);
  });
  relay.on("error", () => {
    console.log(`failed to connect to ${relay.url}`);
  });

  return {
    relay,
    prikey,
    pubkey,
    prikeyNS,
    pubkeyNP,
  };
}

const huobipro = new ccxt.huobipro();
async function getBtcText() {
  const time = dayjs().format("HH:mm:ss");
  const priceInfo = await huobipro.fetchTicker("BTC/USDT");
  const btctext = `BTC Price: $${priceInfo.last} [${time}]`;
  return btctext;
}
async function updatePrice({
  relay,
  prikey,
  pubkey,
  prikeyNS,
  pubkeyNP,
}: {
  relay: Relay;
  prikey: string;
  pubkey: string;
  prikeyNS: string;
  pubkeyNP: string;
}) {
  const text = JSON.stringify({
    name: "BTC-Price(realtime)",
    about: await getBtcText(),
    picture:
      "https://nostr.build/i/nostr.build_438534c420a7b62195a70f59d78575eaf020acba5450ebb7a58cea86647d0e02.png",
  });
  publishTextNote(Kind.Metadata, text, relay, prikey, pubkey);
}
async function publishPrice({
  relay,
  prikey,
  pubkey,
  prikeyNS,
  pubkeyNP,
}: {
  relay: Relay;
  prikey: string;
  pubkey: string;
  prikeyNS: string;
  pubkeyNP: string;
}) {
  const text = JSON.stringify({
    name: "BTC-Price(realtime)",
    about: await getBtcText(),
    picture:
      "https://nostr.build/i/nostr.build_438534c420a7b62195a70f59d78575eaf020acba5450ebb7a58cea86647d0e02.png",
  });
  publishTextNote(
    Kind.Text,
    (await getBtcText()) + "(message publish per hour, profile update per min)",
    relay,
    prikey,
    pubkey
  );
}

const cli = meow(
  `
  Usage
    $ yarn start <input>

  Options
    --prikey, -p  Set the prikey
`,
  {
    flags: {
      prikey: {
        type: "string",
        alias: "p",
      },
    },
  }
);

if (cli.flags.prikey) {
  start({ prikey: cli.flags.prikey }).then((server) => {
    if (server) {
      var job = new CronJob("0 */1 * * * *", () => {
        updatePrice(server);
      });
      job.start();
      var job2 = new CronJob("0 0 */1 * * *", () => {
        publishPrice(server);
      });
      job2.start();
    }
  });
} else {
  console.log("need set prikey!");
}
