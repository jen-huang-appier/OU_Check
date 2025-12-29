const axios = require('axios');

exports.handler = async (event, context) => {
    // 僅允許 POST 請求
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const { url } = JSON.parse(event.body);
        const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
        const domain = urlObj.hostname;

        const aasaUrl = `https://${domain}/.well-known/apple-app-site-association`;
        const assetUrl = `https://${domain}/.well-known/assetlinks.json`;

        const [aasaRes, assetRes] = await Promise.allSettled([
            axios.get(aasaUrl, { timeout: 5000 }),
            axios.get(assetUrl, { timeout: 5000 })
        ]);

        const result = {
            ios: { status: 'Missing', details: null, pathMatch: false, declaredPaths: [] },
            android: { status: 'Missing', details: null }
        };

        if (aasaRes.status === 'fulfilled') {
            result.ios.status = 'Found';
            result.ios.details = aasaRes.value.data;
            const details = aasaRes.value.data.applinks?.details || [];
            let allPaths = [];
            let hasPathsKey = false;

            details.forEach(d => {
                if (Object.prototype.hasOwnProperty.call(d, 'paths')) {
                    hasPathsKey = true;
                    if (Array.isArray(d.paths)) allPaths = [...allPaths, ...d.paths];
                }
            });
            result.ios.declaredPaths = allPaths;
            result.ios.pathMatch = (hasPathsKey && allPaths.length > 0);
        }

        if (assetRes.status === 'fulfilled') {
            result.android.status = 'Found';
            result.android.details = assetRes.value.data;
        }

        return {
            statusCode: 200,
            body: JSON.stringify(result)
        };
    } catch (err) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid URL' }) };
    }
};