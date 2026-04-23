import "dotenv/config";
import { parseUrl } from "../src/parsing/url/url-parse.adapter.js";

type TestRow = {
  site: string;
  url: string;
};

const URLS: TestRow[] = [
  { site: "100 Days of Real Food", url: "https://www.100daysofrealfood.com/easiest-mexican-chicken-recipe/" },
  { site: "Alaska from Scratch", url: "https://www.alaskafromscratch.com/2012/10/12/slow-cooker-jambalaya/" },
  { site: "All Day I Dream About Food", url: "https://alldayidreamaboutfood.com/cheesy-chicken-broccoli-casserole/" },
  { site: "Amidst the Chaos", url: "https://amidstthechaos.ca/2015/07/carnival-chicken/" },
  { site: "Angie's Recipes", url: "https://angiesrecipes.blogspot.com/2024/07/paprika-chicken.html" },
  { site: "Baked Bree", url: "https://bakedbree.com/rigatoni" },
  { site: "Beyond Kimchee", url: "https://www.beyondkimchee.com/30-minute-kimchi/" },
  { site: "Broke Ass Gourmet", url: "https://brokeassgourmet.com/articles/mongolian-beef" },
  { site: "Chef Michael Smith", url: "https://chefmichaelsmith.com/recipe/classic-chicken-stew/" },
  { site: "Civilized Caveman Cooking", url: "https://civilizedcaveman.com/recipes/poultry/jalapeno-dijon-grilled-chicken/" },
  { site: "Closet Cooking", url: "https://www.closetcooking.com/chicken-stew/" },
  { site: "David Lebovitz", url: "https://www.davidlebovitz.com/vanilla-ice-cream/" },
  { site: "BBC GoodFood", url: "https://www.bbcgoodfood.com/recipes/easy-chicken-curry" },
  { site: "Gourmet (via Epicurious)", url: "https://www.epicurious.com/recipes/food/views/classic-cheese-souffle-387834" },
  { site: "Hungry Girl", url: "https://www.hungry-girl.com/recipe-makeovers/healthy-slow-cooker-marry-me-chicken-swap-recipe" },
  { site: "Joy of Baking", url: "https://www.joyofbaking.com/ChocolateChunkCookies.html" },
  { site: "King Arthur Baking", url: "https://www.kingarthurbaking.com/recipes/the-easiest-loaf-of-bread-youll-ever-bake-recipe" },
  { site: "My Gourmet Connection", url: "https://www.mygourmetconnection.com/creamy-hungarian-mushroom-soup/" },
  { site: "NYT Cooking", url: "https://cooking.nytimes.com/recipes/1017938-chocolate-chip-cookies" },
  { site: "PBS Food", url: "https://www.pbs.org/food/recipes/biscuits-and-gravy" },
  { site: "Pillsbury", url: "https://www.pillsbury.com/recipes/ranch-chicken-crescent-roll-bake/dc33ba58-797f-4b38-b952-d61ca4b4d9d6" },
  { site: "Saveur", url: "https://www.saveur.com/recipes/profiteroles/" },
  { site: "Serious Eats", url: "https://www.seriouseats.com/the-food-lab-best-chocolate-chip-cookie-recipe" },
  { site: "Simply Recipes", url: "https://www.simplyrecipes.com/recipes/chocolate_chip_cookies/" },
  { site: "Taste of Home", url: "https://www.tasteofhome.com/recipes/fried-corn/" },
  { site: "Tasty Kitchen", url: "https://tastykitchen.com/recipes/breakfastbrunch/tasty-crepes/" },
  { site: "The Girl Who Ate Everything", url: "https://www.the-girl-who-ate-everything.com/chicken-salad-recipe/" },
  { site: "The Pioneer Woman", url: "https://www.thepioneerwoman.com/food-cooking/recipes/a80389/the-best-chicken-salad-ever/" },
  { site: "Washington Post", url: "https://www.washingtonpost.com/food/2024/01/02/jacques-ppin-chicken-breast/" },
  { site: "Woman's Day", url: "https://www.womansday.com/food-recipes/a28568525/chicken-pot-pie-recipe/" },
];

type BucketName = "full" | "no-hero" | "failed";

type Result = {
  site: string;
  url: string;
  bucket: BucketName;
  extractionMethod: string;
  title: string | null;
  imageUrl: string | null;
  ingredientCount: number;
  stepCount: number;
  durationMs: number;
  errorReason: string | null;
};

function bucketFor(r: Omit<Result, "bucket">): BucketName {
  const hasContent =
    r.extractionMethod !== "error" &&
    r.ingredientCount >= 2 &&
    r.stepCount >= 1 &&
    !!r.title;
  if (!hasContent) return "failed";
  return r.imageUrl ? "full" : "no-hero";
}

async function runOne(row: TestRow): Promise<Result> {
  const start = Date.now();
  try {
    const candidate = await parseUrl(row.url, [], "server-fetch");
    const base = {
      site: row.site,
      url: row.url,
      extractionMethod: candidate.extractionMethod ?? "unknown",
      title: candidate.title,
      imageUrl: candidate.metadata?.imageUrl ?? null,
      ingredientCount: candidate.ingredients?.length ?? 0,
      stepCount: candidate.steps?.length ?? 0,
      durationMs: Date.now() - start,
      errorReason:
        candidate.extractionMethod === "error" ? "all_paths_failed" : null,
    };
    return { ...base, bucket: bucketFor(base) };
  } catch (err) {
    const base = {
      site: row.site,
      url: row.url,
      extractionMethod: "throw",
      title: null,
      imageUrl: null,
      ingredientCount: 0,
      stepCount: 0,
      durationMs: Date.now() - start,
      errorReason: err instanceof Error ? err.message : "unknown",
    };
    return { ...base, bucket: "failed" };
  }
}

async function main() {
  console.log(`\nRunning ${URLS.length} URLs sequentially...\n`);
  const results: Result[] = [];
  for (let i = 0; i < URLS.length; i++) {
    const row = URLS[i];
    process.stdout.write(`[${i + 1}/${URLS.length}] ${row.site}... `);
    const r = await runOne(row);
    results.push(r);
    console.log(
      `${r.bucket.padEnd(7)} ${r.extractionMethod.padEnd(10)} ing=${r.ingredientCount} steps=${r.stepCount} hero=${r.imageUrl ? "Y" : "N"} ${r.durationMs}ms`,
    );
  }

  const bySite = new Map<BucketName, Result[]>();
  for (const r of results) {
    if (!bySite.has(r.bucket)) bySite.set(r.bucket, []);
    bySite.get(r.bucket)!.push(r);
  }

  console.log("\n===== SUMMARY =====");
  console.log(`Full (recipe + hero image): ${bySite.get("full")?.length ?? 0}`);
  console.log(`No-hero (recipe, no image): ${bySite.get("no-hero")?.length ?? 0}`);
  console.log(`Failed: ${bySite.get("failed")?.length ?? 0}`);

  console.log("\n===== DETAIL (markdown) =====\n");
  console.log("| Site | URL | Bucket | Method | Title | Ingredients | Steps | Hero | Duration |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    const shortUrl = r.url.length > 60 ? r.url.slice(0, 57) + "..." : r.url;
    const shortTitle = r.title ? (r.title.length > 40 ? r.title.slice(0, 37) + "..." : r.title) : "—";
    console.log(
      `| ${r.site} | ${shortUrl} | ${r.bucket} | ${r.extractionMethod} | ${shortTitle} | ${r.ingredientCount} | ${r.stepCount} | ${r.imageUrl ? "Y" : "N"} | ${r.durationMs}ms |`,
    );
  }

  console.log("\n===== FAILURES (full URLs) =====");
  for (const r of results.filter((r) => r.bucket === "failed")) {
    console.log(`- ${r.site}: ${r.url}  (${r.errorReason ?? "unknown"})`);
  }

  console.log("\n===== NO-HERO (full URLs) =====");
  for (const r of results.filter((r) => r.bucket === "no-hero")) {
    console.log(`- ${r.site}: ${r.url}`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
