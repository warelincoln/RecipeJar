# RecipeJar — explain every file like you’re five (really)

**What this is:** RecipeJar is an app idea: you save recipes (from photos or web pages) and look at them on your phone. This folder is **all the written instructions** that humans and computers use to build that app.

**How this document works:** Below is **one short story per file**—like a label on every Lego brick in a giant set. The files listed here are the ones the team **keeps in a shared “memory box”** (called **version control**). That box remembers old versions so nothing important gets lost. Some other folders are **not** in the box on purpose—like a trash pile of downloaded tools, secret passwords, or stuff the computer rebuilds by itself. Those aren’t listed one-by-one here.

**Words you might see once:**

- **Computer program** = a list of steps a machine follows.
- **Phone app** = a program that shows buttons and pictures on your phone.
- **The “brain computer” in this project** = a program that can run on someone’s laptop or in the cloud. The phone app talks to it when it needs to save a recipe or read a photo. You don’t need to run it yourself to read this guide.
- **Filing cabinet** = a simple picture for **where saved recipes live** on disk (organized drawers and folders of information).

---

## Part 1 — Start here: what humans read first

### `README.md`

**ELI5:** The **big storybook** at the front door. It tells people what RecipeJar is, what’s in the folder, and how someone who *does* build the app usually starts. If you only read one long file, it’s meant to be this one.

### `ROADMAP.md`

**ELI5:** A **“someday” list** drawn on the fridge: dreams and next steps for the app, not a promise about dates. It helps everyone remember what might come after what works today.

### `CHANGELOG.md`

**ELI5:** A **diary of what changed** when the team shipped something new—like “Monday we fixed the camera” but for the whole project. Handy when someone asks, “What did we change last time?”

### `QA_CHECKLIST.md`

**ELI5:** A **practice test script** for grown-ups checking quality. For each pretend situation it says: do this, then you should see that warning or that screen. It’s how the team double-checks that saving recipes, photos, and web imports still behave before trusting a release.

---

## Part 2 — Rules for the whole folder

### `.gitignore`

**ELI5:** A note that says, **“Don’t put these things in the shared memory box.”** Usually that’s giant downloaded tool piles, secret key files, or scratch paper the computer can make again anytime. Keeps the box light and safe.

### `package.json`

**ELI5:** A **table of contents** for the whole project’s tool downloads. It names the three big areas inside RecipeJar (shared word list, brain computer, phone app) and says what tiny chores to run after installing tools—like “apply small fixes” and “write down this computer’s home Wi‑Fi address for the phone.”

### `package-lock.json`

**ELI5:** A **frozen shopping receipt** listing exact versions of every downloaded tool. So when another person opens the folder tomorrow, they get the *same* versions—not surprise mix-and-match that breaks things.

---

## Part 3 — Little robot helpers (automation)

### `scripts/ensure-phone-dev.sh`

**ELI5:** A **checklist robot** for people testing on a real phone. It peeks at whether two “listening doors” on the computer are open (one for the brain program, one for sending the phone-app instructions). If a door is closed, it tries to open it and waits until both are ready—so the phone can talk to the laptop on the same Wi‑Fi.

### `scripts/write-recipejar-dev-host.cjs`

**ELI5:** A tiny program that **asks the laptop, “What’s your address on the home Wi‑Fi?”** and writes that answer into a small auto-made file the phone app reads. Without the right address, a physical phone would knock on the wrong door and never find the brain computer during building-and-testing.

### `patches/react-native+0.76.9.patch`

**ELI5:** A **band-aid slip** that gets pasted onto a downloaded toolkit (the one that helps build the phone app) every time tools are installed. The band-aid fixes a silly problem: if the project lives in a folder whose **name has spaces** (like “MACBOOK PRO DESKTOP”), the old scripts got confused. This makes them behave.

### `patches/react-native-svg+15.15.4.patch`

**ELI5:** Another **band-aid** for a drawing-icons toolkit. Two parts of the toolbox expected slightly different words for “how wide/tall is this picture?” This patch makes them agree so the app can draw icons without the build step crying.

---

## Part 4 — The shared word list (so phone and brain agree)

Imagine two friends passing notes. They need the **same words** for “recipe,” “half-finished import,” and “this looks wrong.” These files are that agreement—**not** the pretty screens, just the **shapes of information**.

### `shared/package.json`

**ELI5:** A small label saying, “This folder is the **shared dictionary** package” and where the front door file lives.

### `shared/tsconfig.json`

**ELI5:** House rules for checking the dictionary’s text files for spelling/grammar-style mistakes **before** anyone trusts them as instructions.

### `shared/src/index.ts`

**ELI5:** The **front door** of the dictionary: one list that points to everything else so other parts of the project can grab “all the shared meanings” from a single place.

### `shared/src/constants.ts`

**ELI5:** A couple of **agreed limits** everyone must follow—like “a note can only be this long” or “a copied web page can only be this big”—so the phone and brain never argue about the rules.

### `shared/src/types/validation.types.ts`

**ELI5:** Describes **what “checking a recipe” can find**: little labels for problems, how serious they are, and whether the user must stop, fix, or just notice something.

### `shared/src/types/save-decision.types.ts`

**ELI5:** Describes **whether you’re allowed to keep the recipe** after checking—perfect save, save with “I’m sure,” or no save until something is fixed.

### `shared/src/types/signal.types.ts`

**ELI5:** Describes **raw clues** picked off a page—ingredients and steps as the reader first sees them, before they’re cleaned up for the library.

### `shared/src/types/parsed-candidate.types.ts`

**ELI5:** Describes the **first guess** at a recipe right after reading a photo or webpage—like a rough draft before you edit titles and typos.

### `shared/src/types/recipe.types.ts`

**ELI5:** Describes a **finished recipe in the library**: name, steps, ingredients, folders it’s in, little notes, stars, pictures, and where it came from.

### `shared/src/types/draft.types.ts`

**ELI5:** Describes a **recipe still being imported**: which step you’re on, photos collected, edits you made, what the checker said, and warnings you waved away.

---

## Part 5 — The brain computer (saves recipes, reads photos and pages)

This is the program that **remembers** things and does **heavy reading**. The phone app is the remote control; this is more like the kitchen that actually cooks.

### `server/package.json`

**ELI5:** Shopping list for the brain program’s tools—how to talk to the filing cabinet, how to speak “web,” how to shrink photos, how to ask an AI helper—and buttons named “run,” “watch for changes,” and “run automatic checks.”

### `server/tsconfig.json`

**ELI5:** House rules for checking the brain program’s instruction files for consistency.

### `server/vitest.config.ts`

**ELI5:** Settings for a **robot grader** that runs little tests to catch mistakes automatically before humans trust a change.

### `server/.env.example`

**ELI5:** A **fake settings sheet** showing what secret settings the brain needs (passwords, addresses) **without** writing the real secrets in the shared box. Real secrets stay on each person’s own machine.

### `server/drizzle.config.ts`

**ELI5:** Instructions for a **tool that helps change the filing cabinet layout safely**—where the cabinet is and where the “change recipes” (migration) files live.

### `server/drizzle/0000_new_raider.sql`

**ELI5:** The **first big blueprint** for the filing cabinet: creates the main drawers for half-finished imports, pages of photos, warnings, saved recipes, ingredients, steps, and how they connect—like pouring the foundation of a house.

### `server/drizzle/0001_smart_champions.sql`

**ELI5:** Adds **recipe folders** (“collections”) and a single **“this recipe goes in this folder”** slot on each recipe—before the team later allowed many folders per recipe.

### `server/drizzle/0002_numerous_norman_osborn.sql`

**ELI5:** Lets a step line be marked as a **section title** (like “For the sauce”) instead of an action step—so the app can show headings nicely.

### `server/drizzle/0003_recipe_collections_join_table.sql`

**ELI5:** Switches from **one folder per recipe** to **many folders per recipe** using an in-between list (like a sticker sheet linking recipes and folders), copies old choices into it, and removes the old single-slot way.

### `server/drizzle/0004_burly_yellow_claw.sql`

**ELI5:** Adds **short sticky notes per recipe** and a place to store **star ratings** (counted in half-star steps).

### `server/drizzle/0005_recipe_image_url.sql`

**ELI5:** Adds a slot to remember **a link to a cover picture** for a recipe after a picture is stored somewhere on the internet.

### `server/drizzle/0006_outgoing_beast.sql`

**ELI5:** Adds a place to write a **plain-English error** when the automatic reader fails on a half-finished import—so the app can show “here’s what went wrong.”

### `server/drizzle/0007_structured_ingredients_servings.sql`

**ELI5:** Adds **“serves how many people”** on a recipe and richer ingredient fields (amounts, units, names) so the app can scale or shop smarter later.

### `server/drizzle/meta/_journal.json`

**ELI5:** A **numbered chapter list** of which cabinet-change files ran and in what order—so nobody applies changes twice or out of order by accident.

### `server/drizzle/meta/0000_snapshot.json`

**ELI5:** A **camera photo** of every drawer label right after change #0. The tool compares photos to the latest plan to suggest the next safe change.

### `server/drizzle/meta/0001_snapshot.json`

**ELI5:** Same idea—a **photo of the cabinet** after change #1 (folders exist; each recipe can point at one folder).

### `server/drizzle/meta/0002_snapshot.json`

**ELI5:** **Photo after change #2** (steps can be “header” lines).

### `server/drizzle/meta/0003_snapshot.json`

**ELI5:** **Photo after change #3** (many folders per recipe via the linking list).

### `server/drizzle/meta/0004_snapshot.json`

**ELI5:** **Photo after change #4** (notes table and ratings).

### `server/drizzle/meta/0006_snapshot.json`

**ELI5:** **Photo after change #6** (drafts can store a friendly error message). Change #5 still happened, but this repo doesn’t keep a separate photo file for #5—only the chapter list remembers #5 happened.

### `server/src/app.ts`

**ELI5:** **Turns on the brain computer:** loads settings, opens the doors for incoming messages, understands JSON notes and uploaded photos, wires up the “imports,” “saved recipes,” and “folders” desks, offers a simple **“are you awake?”** ping, listens on a network port, and on startup tidies **stuck** or **very old cancelled** half-finished imports.

### `server/src/api/drafts.routes.ts`

**ELI5:** The **desk labeled “imports in progress”**: messages for start an import, add a photo page, say “read this now,” fix text, run the checker, finish or cancel.

### `server/src/api/recipes.routes.ts`

**ELI5:** The **desk labeled “saved recipes”**: list them, open one, change one, delete one, stars, sticky notes, which folders they’re in—what the home screen and recipe page need.

### `server/src/api/collections.routes.ts`

**ELI5:** The **desk labeled “folders”**: make, rename, list, remove folders and move recipes between them.

### `server/src/domain/save-decision.ts`

**ELI5:** A **referee** with a simple rule book: given what the checker said and what warnings the human dismissed, **may we save?** and **what flavor of save is it** (perfect, “I’m sure,” or not yet)?

### `server/src/domain/validation/validation.engine.ts`

**ELI5:** Runs **every checker rule, one after another**, and stacks the results into one report the phone can show.

### `server/src/domain/validation/rules.description.ts`

**ELI5:** One checker: is the **short description** sensible, or does something look off?

### `server/src/domain/validation/rules.ingredients.ts`

**ELI5:** Checkers for **ingredient lines**—missing amounts, fuzzy units, that sort of thing.

### `server/src/domain/validation/rules.integrity.ts`

**ELI5:** Checkers that ask, **“Does the whole recipe still make sense together?”**—no parts that contradict each other badly.

### `server/src/domain/validation/rules.required-fields.ts`

**ELI5:** Checkers for **must-haves**—like “there must be a title” or “there must be at least one real step.”

### `server/src/domain/validation/rules.retake.ts`

**ELI5:** Decides if photos are **too blurry or useless** and the human should **take new pictures**.

### `server/src/domain/validation/rules.servings.ts`

**ELI5:** Checkers for **“how many people does this feed?”** looking reasonable.

### `server/src/domain/validation/rules.steps.ts`

**ELI5:** Checkers for **steps**—empty lines, order, titles vs. real steps.

### `server/src/domain/validation/rules.structure.ts`

**ELI5:** Checkers for **big-picture shape** so lists and sections don’t look broken on screen.

### `server/src/parsing/normalize.ts`

**ELI5:** **Tidy-up helpers for text**—extra spaces, funny dashes—so the readers get clean sentences.

### `server/src/parsing/ingredient-parser.ts`

**ELI5:** Tries to split **one ingredient line** into amount, unit, and name when the line looks parseable.

### `server/src/parsing/parse-semaphore.ts`

**ELI5:** A **bouncer at the door**: only lets a few heavy “read this now” jobs run at once so one busy hour doesn’t melt the computer.

### `server/src/parsing/image/image-parse.adapter.ts`

**ELI5:** The **photo lane**: sends pictures to the smart reader and turns them into a rough-draft recipe.

### `server/src/parsing/image/image-optimizer.ts`

**ELI5:** **Shrinks or squishes photos** before the expensive reading step—faster and cheaper, like scanning a smaller photocopy.

### `server/src/parsing/url/url-parse.adapter.ts`

**ELI5:** The **webpage lane**: fetch the page safely, try structured clues, try AI if needed, end with a rough-draft recipe.

### `server/src/parsing/url/url-fetch.service.ts`

**ELI5:** **Actually goes and gets the webpage** from the internet, with limits so one bad link doesn’t download a whole encyclopedia.

### `server/src/parsing/url/url-ssrf-guard.ts`

**ELI5:** A **safety rule** that says “don’t let a sneaky link trick our computer into poking private networks or special internal addresses.” Protects the team’s machines, not really a kid-level threat—but the file is the lock on that door.

### `server/src/parsing/url/url-dom.adapter.ts`

**ELI5:** Reads a webpage like **highlighting sentences in a printed page**—find titles, lists, and blocks of text from the HTML.

### `server/src/parsing/url/url-structured.adapter.ts`

**ELI5:** Looks first for **recipe-shaped stickers** some websites hide in the code (machine-friendly recipe data). If found, that’s often easier than guessing from layout alone.

### `server/src/parsing/url/url-ai.adapter.ts`

**ELI5:** Asks a **large language helper** (think very advanced autocomplete) to make sense of messy pages when simple reading isn’t enough.

### `server/src/persistence/schema.ts`

**ELI5:** The **master drawing** of every drawer and label in the filing cabinet, written in a form the brain program understands. The numbered `.sql` files are the history of changes; this drawing is **today’s truth**.

### `server/src/persistence/db.ts`

**ELI5:** Opens the **pipe to the filing cabinet** so every save/load helper can share one connection pool.

### `server/src/persistence/drafts.repository.ts`

**ELI5:** All the **save/load steps for half-finished imports**—create, update status, attach photos, store read results, unstick stuck jobs, delete ancient cancelled ones.

### `server/src/persistence/recipes.repository.ts`

**ELI5:** All the **save/load steps for finished recipes** in the library.

### `server/src/persistence/collections.repository.ts`

**ELI5:** All the **save/load steps for folders** and which recipes sit in them.

### `server/src/persistence/recipe-notes.repository.ts`

**ELI5:** **Save and load sticky notes** tied to one recipe.

### `server/src/services/supabase.ts`

**ELI5:** Connects to **Supabase**—an online service toolkit—for things like storing files in the cloud or sign-in features the brain uses.

### `server/src/services/recipe-image.service.ts`

**ELI5:** **Picture moving helper**: put a recipe photo in online storage and hand back a public link the app can show.

### `server/src/observability/event-logger.ts`

**ELI5:** Writes **short diary lines** when important things happen (like “we cleaned up N stuck imports on startup”) so someone debugging can follow the trail.

### `server/tests/integration.test.ts`

**ELI5:** Automatic checks that **several rooms work together**—closer to a dress rehearsal than testing one light switch.

### `server/tests/validation.engine.test.ts`

**ELI5:** Automatic checks that the **checker** flags sample recipes the way we expect.

### `server/tests/save-decision.test.ts`

**ELI5:** Automatic checks that the **save referee** picks the right outcome for different warning mixes.

### `server/tests/parsing.test.ts`

**ELI5:** Automatic checks for **text cleanup and small parsing tricks** using fixed examples.

### `server/tests/url-ssrf-guard.test.ts`

**ELI5:** Automatic checks that **naughty fake links** are blocked and normal links are allowed.

### `server/tests/machine.test.ts`

**ELI5:** Automatic checks that run the **phone import flowchart** on the laptop with **pretend internet**—proving the steps go capture → read → save without needing a real phone.

---

## Part 6 — The phone app (what you tap and see)

This is mostly **screens and buttons** built with a toolkit meant for **both iPhone and Android**. The toolkit’s name isn’t important to understand the idea: it’s “one project, many phones.”

### `mobile/package.json`

**ELI5:** Shopping list for the phone app: the toolkit, moving between screens, camera, gestures, fast pictures, memory helpers for the screen, a **flowchart engine** for the import wizard, and a wire to the **shared dictionary** folder.

### `mobile/tsconfig.json`

**ELI5:** House rules for checking the phone app’s instruction files.

### `mobile/app.json`

**ELI5:** Gives the app its **short internal name** so the phone knows which program this is when it registers with the system.

### `mobile/index.js`

**ELI5:** The **first page of the phone’s script**: “Dear phone, the main screen is called `App`—please show it.”

### `mobile/App.tsx`

**ELI5:** The **root of everything you see**: wraps the app so swipes and safe screen edges work, sets up **stack of screens** (home, recipe, import popovers), shows the **“imports still running”** strip at the top, and starts a **gentle repeating check** so half-finished imports update when the brain finishes work.

### `mobile/babel.config.js`

**ELI5:** Settings for a **translator** that turns modern instruction style into something older phones understand during building.

### `mobile/metro.config.js`

**ELI5:** Settings for the **bundler**—the helper that packs thousands of small files into one stream for the phone and watches for edits while someone is developing.

### `mobile/react-native.config.js`

**ELI5:** Optional **fine-tuning** for how native phone features plug into the toolkit automatically.

### `mobile/.gitignore`

**ELI5:** Extra “don’t save in the box” notes **just for the phone folder**—build dust, local secrets, auto-written Wi‑Fi address files, etc.

### `mobile/run.sh`

**ELI5:** **Shortcut buttons** for developers: build for fake phone on the Mac vs. real phone, avoid one common “two builds fighting” headache, pick a default fake iPhone model.

### `mobile/src/navigation/types.ts`

**ELI5:** A cheat sheet: **which screen accepts which slip of paper** (recipe ID, link, mode)—so programmers don’t pass the wrong note when opening a screen.

### `mobile/src/services/api.ts`

**ELI5:** The **messenger** between phone and brain: picks the right address (home testing vs. real internet), sends requests, turns failures into readable errors, and bundles all the “please do X” functions for imports, recipes, folders, and uploads.

### `mobile/src/stores/recipes.store.ts`

**ELI5:** A **shared notepad** for recipe lists and open recipe details—what’s loading, what’s cached, keeping the screen in sync when data changes.

### `mobile/src/stores/collections.store.ts`

**ELI5:** A **shared notepad for folders**—list, create, stay in sync with the brain.

### `mobile/src/stores/importQueue.store.ts`

**ELI5:** A **shared notepad for imports still cooking** so the top strip and hub can show status without opening each import.

### `mobile/src/features/import/machine.ts`

**ELI5:** The **flowchart with rules** for the import wizard: which step comes after which (photos → reading → reorder → fix → save). It’s the brain of the wizard, not the pretty colors.

### `mobile/src/features/import/importQueuePoller.ts`

**ELI5:** A hook that **asks the brain again every so often**, “any news on these imports?” so the screen updates when work finishes in the background.

### `mobile/src/features/import/enqueueImport.ts`

**ELI5:** A **single front desk** to start or continue an import the same way whether you came from the camera, a link, or somewhere else.

### `mobile/src/features/import/issueDisplayMessage.ts`

**ELI5:** Turns **short internal problem codes** into normal sentences for popups and panels.

### `mobile/src/features/import/webImportUrl.ts`

**ELI5:** Helpers for **“grab a recipe from the web”**—building the message to the brain and remembering how the in-app browser helped.

### `mobile/src/features/import/recipeParseReveal.ts`

**ELI5:** Numbers and timing for a **little “ta-da” moment** when the read recipe appears.

### `mobile/src/features/import/useRecipeParseReveal.ts`

**ELI5:** A **reusable hook** that runs that ta-da timing on the reading screens.

### `mobile/src/features/import/ParseRevealEdgeGlow.tsx`

**ELI5:** A **glowing edge decoration** during the ta-da moment—pure eye candy tied to the timing above.

### `mobile/src/features/import/CaptureView.tsx`

**ELI5:** The **camera/photo-picker screen** while you snap or choose pictures of recipe pages.

### `mobile/src/features/import/ParsingView.tsx`

**ELI5:** The **“please wait, reading…”** screen with spinner and errors if reading fails.

### `mobile/src/features/import/PreviewEditView.tsx`

**ELI5:** The **“here’s what we think—fix it”** screen before you save.

### `mobile/src/features/import/ReorderView.tsx`

**ELI5:** The **drag pages into order** screen for multi-page recipes.

### `mobile/src/features/import/RetakeRequiredView.tsx`

**ELI5:** The **“photos weren’t good enough—try again”** screen with a path back to the camera.

### `mobile/src/features/import/SavedView.tsx`

**ELI5:** The **happy “it’s in your library”** screen with buttons to go somewhere next.

### `mobile/src/features/import/UrlInputView.tsx`

**ELI5:** The **type or paste a web address** screen for web import.

### `mobile/src/features/collections/collectionIconRules.ts`

**ELI5:** **Picking icons for folders** from the folder name so similar folders get a consistent cute picture.

### `mobile/src/screens/HomeScreen.tsx`

**ELI5:** The **main screen**: grid of recipes, ways to start an import, doorway into folders.

### `mobile/src/screens/RecipeDetailScreen.tsx`

**ELI5:** **One full recipe**—picture, ingredients, steps, stars, notes, extra actions.

### `mobile/src/screens/RecipeEditScreen.tsx`

**ELI5:** **Change a recipe** that’s already saved.

### `mobile/src/screens/CollectionScreen.tsx`

**ELI5:** **Recipes inside one folder** (or a special “everything” view).

### `mobile/src/screens/ImportFlowScreen.tsx`

**ELI5:** **Full-screen wizard host** that connects the flowchart to each step’s visuals.

### `mobile/src/screens/ImportHubScreen.tsx`

**ELI5:** **Mission control for imports**—see what’s in progress, jump back in.

### `mobile/src/screens/WebRecipeImportScreen.tsx`

**ELI5:** **Mini browser inside the app** to load a page and send its contents to the brain when that path is needed.

### `mobile/src/components/RecipeCard.tsx`

**ELI5:** **One rectangle** in the home grid—thumbnail, title, tiny stars.

### `mobile/src/components/RecipeImagePlaceholder.tsx`

**ELI5:** A **nice empty frame** when there’s no food photo yet.

### `mobile/src/components/FullScreenImageViewer.tsx`

**ELI5:** **Full-screen pinch-zoom picture** for recipe photos.

### `mobile/src/components/CompactRecipeRating.tsx`

**ELI5:** **Tiny read-only stars** for lists—look, don’t tap.

### `mobile/src/components/RecipeRatingInput.tsx`

**ELI5:** **Stars you can tap** to set a rating.

### `mobile/src/components/RecipeNotesSection.tsx`

**ELI5:** **Sticky notes area** on a recipe—read and add short notes.

### `mobile/src/components/RecipeQuickActionsSheet.tsx`

**ELI5:** A **panel that slides up** with actions like edit or delete.

### `mobile/src/components/CollectionPickerSheet.tsx`

**ELI5:** A **panel to tick which folders** a recipe belongs in.

### `mobile/src/components/CreateCollectionSheet.tsx`

**ELI5:** A **panel to name and make** a new folder.

### `mobile/src/components/PendingImportsBanner.tsx`

**ELI5:** The **strip at the top** showing imports still running; tap to open hub or a draft.

### `mobile/src/components/ClipboardRecipePrompt.tsx`

**ELI5:** A **“you copied a link—want to import?”** nudge when the clipboard looks like a recipe URL.

### `mobile/src/components/ShimmerPlaceholder.tsx`

**ELI5:** **Gray shimmer blocks** that wiggle while content is still loading—like a skeleton screen.

### `mobile/src/components/ToastQueue.tsx`

**ELI5:** **Small popup messages** lined up politely so they don’t talk over each other.

### `mobile/src/theme/lucideSizes.ts`

**ELI5:** **Agreed icon sizes** so drawings don’t look randomly huge or tiny.

### `mobile/src/utils/scaling.ts`

**ELI5:** Math helpers so spacing looks **okay on small and big phones**.

### `mobile/src/utils/imageCompression.ts`

**ELI5:** **Squishes photos** before sending to the brain so uploads are quicker and cheaper.

---

## Part 7 — The iPhone “shell” (Apple’s box around the app)

Phones need a **native wrapper**—think of it as the **cardboard box** that holds the toy. The toy is still the shared scripts; the box tells iOS how to launch, which permissions to ask, and what icon to show.

The **Gemfile** below is about a Ruby tool installer; the **Podfile** is the iPhone’s list of native add-ons (camera, browser inside app, etc.).

### `mobile/Gemfile`

**ELI5:** Says which **Ruby helper tools** to install for iPhone work—mainly a pinned version of the **CocoaPods** downloader so everyone gets the same native add-ons.

### `mobile/Gemfile.lock`

**ELI5:** The **exact versions** of those Ruby tools, frozen—like a receipt so installs match.

### `mobile/ios/.xcode.env`

**ELI5:** Tells Apple’s builder **where Node lives** on this Mac so React Native’s build steps can run.

### `mobile/ios/Podfile`

**ELI5:** Shopping list for **iPhone-native pieces** (camera, animations, web view, etc.) and **how new the iPhone software must be**.

### `mobile/ios/Podfile.lock`

**ELI5:** Exact versions of every downloaded native piece—**commit this** so two Macs build the same iPhone app.

### `mobile/ios/RecipeJar.xcworkspace/contents.xcworkspacedata`

**ELI5:** Tells Apple’s Xcode: **open both** the app blueprint **and** the downloaded native pieces together—developers open the `.xcworkspace`, not just the `.xcodeproj`.

### `mobile/ios/RecipeJar.xcworkspace/xcshareddata/WorkspaceSettings.xcsettings`

**ELI5:** Shared **workspace quirks** for Xcode—fine print about how the workspace behaves.

### `mobile/ios/RecipeJar.xcodeproj/project.pbxproj`

**ELI5:** The **giant blueprint** of the iPhone app project: which files belong, how to compile, what steps run when you hit Build. Xcode reads this text.

### `mobile/ios/RecipeJar.xcodeproj/xcshareddata/xcschemes/RecipeJar.xcscheme`

**ELI5:** The **shared recipe** for Run / Test / Profile so everyone uses the same build flavor.

### `mobile/ios/RecipeJar.xcodeproj/project.xcworkspace/xcuserdata/lincolnware.xcuserdatad/UserInterfaceState.xcuserstate`

**ELI5:** Xcode’s **memory of which panels were open** on one Mac—usually personal scratch, rarely shared; here it’s in the box anyway.

### `mobile/ios/RecipeJar/AppDelegate.h`

**ELI5:** The **table of contents** for the iPhone startup class—names the hooks without the full story.

### `mobile/ios/RecipeJar/AppDelegate.mm`

**ELI5:** The **full story** for startup: wake up the bridge between iPhone and the JavaScript world, plug in native features, handle app background/foreground.

### `mobile/ios/RecipeJar/main.m`

**ELI5:** The **tiniest starter**: iOS tradition says `main` hands control to Apple’s app system, which then uses the delegate above.

### `mobile/ios/RecipeJar/Info.plist`

**ELI5:** iPhone’s **ID card and permission slips** for the app: display name, icons, why we need camera/photos, special URL rules, etc.

### `mobile/ios/RecipeJar/PrivacyInfo.xcprivacy`

**ELI5:** Apple’s **privacy nutrition label file**—declares kinds of data touched so the App Store can show shoppers a summary.

### `mobile/ios/RecipeJar/LaunchScreen.storyboard`

**ELI5:** The **first flash screen** before the JavaScript UI paints—often a logo or blank branded moment.

### `mobile/ios/RecipeJar/Images.xcassets/Contents.json`

**ELI5:** **Index card** listing image sets bundled with the app.

### `mobile/ios/RecipeJar/Images.xcassets/AppIcon.appiconset/Contents.json`

**ELI5:** **Map** from each required icon size to which PNG file supplies it.

### `mobile/ios/RecipeJar/Images.xcassets/AppIcon.appiconset/icon-40.png`

**ELI5:** One **small square app picture** for spots like notifications on some devices.

### `mobile/ios/RecipeJar/Images.xcassets/AppIcon.appiconset/icon-58.png`

**ELI5:** One **settings-icon-sized** picture for smaller phones.

### `mobile/ios/RecipeJar/Images.xcassets/AppIcon.appiconset/icon-60.png`

**ELI5:** One **home-screen icon** size for standard retina phones.

### `mobile/ios/RecipeJar/Images.xcassets/AppIcon.appiconset/icon-80.png`

**ELI5:** One **spotlight search** icon size.

### `mobile/ios/RecipeJar/Images.xcassets/AppIcon.appiconset/icon-87.png`

**ELI5:** One **settings icon** size for larger phones.

### `mobile/ios/RecipeJar/Images.xcassets/AppIcon.appiconset/icon-120.png`

**ELI5:** One **larger home-screen** icon (and some tablet spots).

### `mobile/ios/RecipeJar/Images.xcassets/AppIcon.appiconset/icon-180.png`

**ELI5:** One **big iPhone home-screen** icon.

### `mobile/ios/RecipeJar/Images.xcassets/AppIcon.appiconset/icon-1024.png`

**ELI5:** The **huge store shelf picture** Apple wants for the App Store listing and validation.

### `mobile/ios/RecipeJarTests/Info.plist`

**ELI5:** **ID card** for the tiny automatic test target that checks non-UI code.

### `mobile/ios/RecipeJarTests/RecipeJarTests.m`

**ELI5:** A **starter automatic test** file Xcode made—sanity checks on the bundle.

### `mobile/ios/RecipeJarUITests/Info.plist`

**ELI5:** **ID card** for tests that **tap the real app** like a robot user.

### `mobile/ios/RecipeJarUITests/RecipeJarUITests.swift`

**ELI5:** **Default robot taps**—usually “does the app launch?” smoke test.

### `mobile/ios/RecipeJarUITests/ImportFlowUITests.swift`

**ELI5:** **Robot script for the import path**—taps buttons with special hidden names (`jar-button`, etc.) so breaking the import screens fails the test.

---

## Part 8 — The Android “shell” (Google’s box around the app)

Same idea as iPhone: **wrapper + permissions + icon + launcher**. Different toolkit names.

### `mobile/android/settings.gradle`

**ELI5:** Lists **which Android modules** belong to the project (the app piece plus auto-wired native add-ons).

### `mobile/android/build.gradle`

**ELI5:** **Top-level recipe** shared by Android modules—plugin versions and common setup.

### `mobile/android/gradle.properties`

**ELI5:** **On/off switches and memory hints** for the Android build (speed, compatibility flags).

### `mobile/android/gradle/wrapper/gradle-wrapper.properties`

**ELI5:** Says **which Gradle version** to download—like pinning a specific oven model for baking.

### `mobile/android/gradle/wrapper/gradle-wrapper.jar`

**ELI5:** A **tiny starter program** that downloads and runs the right Gradle—so you don’t install Gradle by hand.

### `mobile/android/gradlew`

**ELI5:** **Mac/Linux click-script** to run Gradle through that wrapper.

### `mobile/android/gradlew.bat`

**ELI5:** **Windows click-script** to run the same wrapper.

### `mobile/android/app/build.gradle`

**ELI5:** **Main Android app recipe**: app ID, dependencies, signing hooks, React Native glue.

### `mobile/android/app/proguard-rules.pro`

**ELI5:** **Keep-out list** for shrinkers—don’t strip classes the app still needs when making a small release build.

### `mobile/android/app/debug.keystore`

**ELI5:** A **practice key** Android uses to sign test installs so you don’t need a real store key while developing.

### `mobile/android/app/src/main/AndroidManifest.xml`

**ELI5:** Android’s **permission and identity form**: this is RecipeJar, here’s the front door screen, we need camera/internet/storage, etc.

### `mobile/android/app/src/debug/AndroidManifest.xml`

**ELI5:** **Extra permissions only while testing**—not meant for the store build overlay.

### `mobile/android/app/src/main/java/com/recipejar/MainActivity.kt`

**ELI5:** The **first Android screen class** that hosts the React Native canvas and handles rotation/deep links.

### `mobile/android/app/src/main/java/com/recipejar/MainApplication.kt`

**ELI5:** **App-wide Android setup**—register native modules, lifecycle hooks for the toolkit.

### `mobile/android/app/src/main/res/values/strings.xml`

**ELI5:** **Human-readable words** Android shows (app name on launcher, etc.).

### `mobile/android/app/src/main/res/values/styles.xml`

**ELI5:** **Look-and-feel themes**—background colors, default window dressing.

### `mobile/android/app/src/main/res/drawable/rn_edit_text_material.xml`

**ELI5:** **Dressing for text boxes** so default inputs match Google’s Material style.

### `mobile/android/app/src/main/res/mipmap-hdpi/ic_launcher.png`

**ELI5:** **Square launcher icon** for phones with **medium-high** pixel density.

### `mobile/android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png`

**ELI5:** **Round-cropped** version for launchers that use circles on those phones.

### `mobile/android/app/src/main/res/mipmap-mdpi/ic_launcher.png`

**ELI5:** **Square icon** for **medium** density screens.

### `mobile/android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png`

**ELI5:** **Round** version for medium density.

### `mobile/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png`

**ELI5:** **Square icon** for **extra-sharp** medium phones.

### `mobile/android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png`

**ELI5:** **Round** version for that density.

### `mobile/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png`

**ELI5:** **Square icon** for **very sharp** phones.

### `mobile/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png`

**ELI5:** **Round** version for very sharp phones.

### `mobile/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png`

**ELI5:** **Square icon** for **extra-very sharp** phones.

### `mobile/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png`

**ELI5:** **Round** version for extra-very sharp phones.

---

*End of the tour. If new files join the project, add them here too—or regenerate the list from the same “memory box” tool the team uses to track files.*
