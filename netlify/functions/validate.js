const axios = require('axios');

function getFirstSegment(path) {
    if (!path || path === '/') return '';
    return path.replace(/^\//, '').split('/')[0].replace('*', '');
}

exports.handler = async (event, context) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const { url } = JSON.parse(event.body);
        const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
        const domain = urlObj.hostname;

        //  check MMP type
        let mmpType = "other";
        if (domain.includes("onelink")){
            mmpType = "af";
        } else if (domain.includes("adj.st") || domain.includes("go.link")){
            mmpType = "adjust";
        }

        const inputPathSegment = getFirstSegment(urlObj.pathname);
        const aasaUrl = `https://${domain}/.well-known/apple-app-site-association`;
        const assetUrl = `https://${domain}/.well-known/assetlinks.json`;

        const [aasaRes, assetRes] = await Promise.allSettled([
            axios.get(aasaUrl, { timeout: 5000 }),
            axios.get(assetUrl, { timeout: 5000 })
        ]);

        const result = {
            mmpType,
            inputSegment: inputPathSegment,
            ios: { 
                status: 'Missing',
                details: null, 
                validationStatus: 'none', 
                declaredPaths: [],
                aasaSegment: "",
                message: ""
            },
            android: { status: 'Missing', details: null }
        };

        if (aasaRes.status === 'fulfilled') {
            result.ios.status = 'Found';
            const data = aasaRes.value.data;
            result.ios.details = data;
            
            const details = data?.applinks?.details || [];

            if (mmpType === "af"){
                let firstAasaSegment = "";
                const hasPathsKey = details.some(d => {
                    if (d && Object.prototype.hasOwnProperty.call(d, 'paths') && Array.isArray(d.paths) && d.paths.length > 0) {
                        firstAasaSegment = getFirstSegment(d.paths[0]);
                        result.ios.declaredPaths = d.paths;
                        return true;
                    }
                    return false;
                });

                result.ios.aasaSegment = firstAasaSegment;
                if (hasPathsKey && inputPathSegment === firstAasaSegment && firstAasaSegment !== "") {
                    result.ios.validationStatus = 'pass';
                } else {
                    result.ios.validationStatus = 'fail';
                    result.ios.message = hasPathsKey ? "Path Mismatch" : "Missing 'paths' key";
                }
            } else if (mmpType === "adjust") {
                let hasWildcardPath = false;
                details.forEach(d => {
                    if (d?.components && Array.isArray(d.components)) {
                        d.components.forEach(comp => {
                            if (comp["/"] === "/*") hasWildcardPath = true;
                        });
                    }
                });

                if (hasWildcardPath) {
                    result.ios.validationStatus = 'pass';
                } else {
                    result.ios.validationStatus = 'warning';
                    result.ios.message = "warning：請確認客戶AASA路徑設定";
                }
            } else {
                result.ios.validationStatus = 'none';
            }
        }
        
        if (assetRes.status === 'fulfilled' && assetRes.value.data) {
            const assetData = assetRes.value.data;

            if (Array.isArray(assetData) && assetData.length > 0) {
                result.android.status = 'Found';
                result.android.details = assetData;
            } else {
                result.android.status = 'Missing';
                result.android.details = null;
            }
        } else {
            result.android.status = 'Missing';
            result.android.details = null;
        }

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(result)
        };
    } catch (err) {
        return { 
            statusCode: 400, 
            body: JSON.stringify({ error: err.message || 'Invalid URL' }) 
        };
    }
};