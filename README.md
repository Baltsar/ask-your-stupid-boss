# Ask your stupid boss

![In Claude Code a small model asks a bigger advisor. Here Opus 5.5 asks a tiny Haiku 4.5 in a tie, and rejects the advice.](assets/ask-your-stupid-boss.svg)

Claude Code's [advisor](https://code.claude.com/docs/en/advisor) lets the model doing the work ask a stronger model before it commits. The advisor must rank [at or above](https://code.claude.com/docs/en/advisor#choose-an-advisor-model) the one that asks. Haiku 4.5 can call an advisor. Haiku 4.5 cannot be one.

This is the uno reverse. The strong model does the work and asks the weak one.

Den starka modellen jobbar. Den svaga sitter i ledningen. Claudes egen tabell säger nej.

## What Claude says

```console
$ claude --advisor claude-haiku-4-5-20251001 -p "ok"
Error: The model "claude-haiku-4-5-20251001" cannot be used as an advisor.

$ claude --safe-mode --model claude-opus-5-5 --advisor claude-haiku-5-5 -p "ok" > /dev/null
"claude-haiku-5-5" cannot advise "claude-opus-5-5" (the advisor must be at least as capable as the main model). The advisor will not be used for the main model.
```

Claude Code 2.1.296. Haiku 4.5 is stopped at the door. Haiku 5.5 is let in and ignored.

Four rows from [Claude's table](https://code.claude.com/docs/en/advisor#choose-an-advisor-model):

| Main, does the work | Advisors Claude accepts |
| --- | --- |
| Haiku 4.5 | Fable, Opus, Sonnet, Haiku 5.5 |
| Sonnet 5.5 | Fable, Opus 5 or later, Sonnet 5.5 |
| Opus 5 or Opus 5.5 | Fable, Opus 5 or later |
| Fable 5.1 | Fable 5.1 |

Questions go uphill. At the top, Fable 5.1 reports to Fable 5.1.

## The same feature, reversed

| | Claude Code `/advisor` | `/ask-your-stupid-boss` |
| --- | --- | --- |
| Who advises | A model at or above main | A model below main, on purpose |
| What it reads | The whole conversation | One briefing |
| Where it runs | Server-side, as a tool in the session | A separate `claude -p` with no tools and no advisor of its own |
| What you see | `Advising`, then `Reviewed` | `Eskalerar till ledningen.`, then `ADVISOR · Haiku 4.5 · separat modellanrop` |
| What main does | Generally follows | Two `avvisar` and two `accepterar delvis` in four recorded calls |
| What it costs | Less than running the stronger model all the way | An Opus session at 35 cents briefed a boss who cost half a cent |

It is a bit, not a benchmark, and it is not Claude's advisor. It does not touch `/advisor` or your Claude settings. Haiku is told to play the boss: one objection, and preferably a bigger solution than the task needs.

## What happens

A real call, 13 October 2026. Main was Opus 5.5, checked by model id. The plan is a todo list for one person.

```text
MAIN · Opus 5.5
Plan: One file, about 80 lines. Todos live in a JSON file in the home directory.
Eskalerar till ledningen.

ADVISOR · Haiku 4.5 · separat modellanrop
Invändning: File corruption risk under concurrent writes is understated. A single JSON file works for one user, but lacks basic safety for simultaneous access.
Alternativ: Add file-level locking (create a .lock file during writes). Keeps everything in JSON, adds ~5 lines, prevents data loss if two CLI instances run at once.
Fråga: Do you plan to extend this later (sync, multiple devices, persistence)? That changes whether JSON stays viable long-term.
Osäkerhet: Unknown whether concurrency, data durability, or future expansion is a real concern here. The "one user" constraint suggests simplicity wins, but typical evolution patterns suggest it won't stay one user forever.
Ledningskommentar: JSON plus locking is safer than JSON alone and still simpler than a database.

MAIN
Beslut: avvisar
Skäl: One user, one terminal. It is a todo list.
Nästa steg: write the file.
```

Twelve seconds, half a cent. The form is in Swedish. The boss answers in the language of the task.

It does not always go like that. Each of these happened. The receipts are in [examples/transcripts.md](examples/transcripts.md).

- **The boss is right.** A fresh Opus session in Claude Code loaded the skill, wrote the briefing and asked. Haiku 4.5 approved the plan and wanted an atomic write. Opus took it.
- **Haiku 5.5 tries harder.** Same plan. It wanted a schema, a migration table and "sign-off from the stakeholder (you)". Rejected.
- **The boss phones Opus.** Haiku 4.5 may call an advisor of its own, and one call came back with a second model on the bill. Opus asks Haiku, and Haiku asks Opus. The skill threw the answer out and now cuts the line.
- **The boss says nothing.** The first live call hit the 30 second limit. Rerun by hand, Haiku 4.5 thought for 1,942 tokens and took 32. A failed call counts and never turns into parody.
- **Fable is main.** Claude Code gives the same error before any model is called. The skill will not pretend the session is Fable: `Live körs inte.`

## Install

Claude Code has to be signed in, because that is who Haiku answers as. No API key goes into the prompt.

In Claude Code, next to the feature it reverses:

```bash
git clone https://github.com/Baltsar/ask-your-stupid-boss.git ~/.claude/skills/ask-your-stupid-boss
```

In Cursor:

```bash
git clone https://github.com/Baltsar/ask-your-stupid-boss.git ~/.cursor/skills/ask-your-stupid-boss
```

Pick the pair from the folder you cloned into. Copy the ids from `catalog`. A display name is not an id.

```bash
bin/ask-your-stupid-boss catalog
```

```bash
bin/ask-your-stupid-boss setup --main-id claude-opus-5-5 --advisor-id claude-haiku-4-5-20251001 --mode live
```

Say **ask your stupid boss**. In Claude Code you can also type `/ask-your-stupid-boss`. `--advisor haiku` gets `cannot advise`. This gets an answer.

Once set up it is on. The working model asks the boss about every plan with a real choice in it, at most twice per task unless you allow more, and each call is billed to your Claude account. `off` stops it. In a serious personal situation the boss is still asked, and only its one-line remark is dropped.

The chat model has to be the main you configured. The skill does not switch it for you. If the window is someone else, live waits and says so.

## What is labeled

Opus can throw the advice out. Haiku cannot veto, open a file, or hire a subcommittee. Two live attempts per task.

Parody mode is the main model doing the voice. It says so every time:

```text
ADVISOR · simulerad roll · inget separat modellanrop
Simulerad rådgivare — inget separat modellanrop
```

## Tests

Node 22 or newer.

```bash
bash scripts/run-ts.sh tests/consult.test.ts
```

## License

[MIT](LICENSE)

A parody. Not affiliated with Anthropic. Claude, its model names and its mascot belong to Anthropic.
