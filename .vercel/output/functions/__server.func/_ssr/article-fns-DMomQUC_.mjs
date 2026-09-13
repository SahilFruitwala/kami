import { n as TSS_SERVER_FUNCTION, t as createServerFn } from "./ssr.mjs";
import { i as string, r as object } from "../_libs/zod.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/article-fns-DMomQUC_.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var urlInput = object({ url: string().trim().min(4, "Paste a URL first.") });
var extractArticle_createServerFn_handler = createServerRpc({
	id: "5710449ee1ab2b93c2de9f0d8620a25580df924d9665549669b1829113764dd3",
	name: "extractArticle",
	filename: "src/lib/article-fns.ts"
}, (opts) => extractArticle.__executeServer(opts));
var extractArticle = createServerFn({ method: "POST" }).validator((input) => urlInput.parse(input)).handler(extractArticle_createServerFn_handler, async ({ data }) => {
	const { extractArticleFromUrl } = await import("./extract.server-C27z0Q-W.mjs");
	return extractArticleFromUrl(data.url);
});
//#endregion
export { extractArticle_createServerFn_handler };
