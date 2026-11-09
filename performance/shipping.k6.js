import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const base = __ENV.BASE_URL || 'http://127.0.0.1:8080';
const requestErrors = new Rate('request_errors');
const profile = __ENV.PROFILE || 'baseline';
const workloads = {
    baseline: { scenarios: { baseline: {
        executor: 'constant-vus', vus: 1, duration: '50s', gracefulStop: '5s',
    } } },
    load: { scenarios: { load: {
        executor: 'ramping-vus', startVUs: 0,
        stages: [{ duration: '10s', target: 10 }, { duration: '40s', target: 10 }],
        gracefulRampDown: '5s', gracefulStop: '5s',
    } } },
    stress: { scenarios: { stress: {
        executor: 'ramping-vus', startVUs: 0,
        stages: [{ duration: '10s', target: 10 }, { duration: '10s', target: 25 },
            { duration: '10s', target: 50 }, { duration: '20s', target: 50 }],
        gracefulRampDown: '5s', gracefulStop: '5s',
    } } },
};
if (!workloads[profile]) throw new Error(`Unknown profile: ${profile}`);
export const options = {
    ...workloads[profile],
    thresholds: {
        http_req_duration: ['p(95)<500'],
        http_req_failed: ['rate<0.01'],
        request_errors: ['rate<0.01'],
        checks: ['rate==1'],
    },
};

function send(method, path, name, expectedStatus, body, validate) {
    const response = http.request(method, `${base}${path}`, body ? JSON.stringify(body) : null, {
        headers: { 'Content-Type': 'application/json' },
        tags: { name },
        timeout: '10s',
        responseCallback: http.expectedStatuses(expectedStatus),
    });
    let data = null;
    try { data = response.json(); } catch (_) { /* Failed responses may not be JSON. */ }
    const valid = check(response, {
        [`${name}: status ${expectedStatus}`]: r => r.status === expectedStatus,
        [`${name}: valid body`]: () => !!data && validate(data),
    });
    requestErrors.add(!valid);
    return valid ? data : null;
}

export default function () {
    // Unique across runs, virtual users and iterations; codes stay under 40 characters.
    const key = `${__ENV.RUN_ID}-${__VU}-${__ITER}`;
    try {
        const customer = send('POST', '/customers', 'POST /customers', 201,
            { code: `C-${key}`, regular: false }, d => Number.isSafeInteger(d.id) && d.id > 0);
        if (!customer) return;
        const parcel = send('POST', '/parcels', 'POST /parcels', 201,
            { code: `P-${key}`, weightGrams: 5000, declaredValue: 50000,
                lengthCm: 10, widthCm: 10, heightCm: 10 }, d => Number.isSafeInteger(d.id) && d.id > 0);
        if (!parcel) return;
        const shipment = send('POST', '/shipments', 'POST /shipments', 201,
            { reference: `S-${key}`, customerId: customer.id, parcelId: parcel.id,
                distanceKm: 100, urgent: false, pickup: false },
            d => Number.isSafeInteger(d.id) && d.id > 0 && d.customerId === customer.id
                && d.parcelId === parcel.id && d.status === 'Registered' && d.total === 11000);
        if (!shipment) return;
        send('GET', `/shipments/${shipment.id}`, 'GET /shipments/:id', 200, null,
            d => d.id === shipment.id && d.customerId === customer.id && d.parcelId === parcel.id
                && d.reference === shipment.reference && d.status === 'Registered' && d.total === 11000);
    } finally {
        sleep(1);
    }
}

export function handleSummary(data) {
    const duration = data.metrics.http_req_duration.values;
    const result = {
        runId: __ENV.RUN_ID,
        profile,
        workload: workloads[profile],
        timestamp: new Date().toISOString(),
        averageMs: duration.avg,
        p95Ms: duration['p(95)'],
        requests: data.metrics.http_reqs.values.count,
        requestsPerSecond: data.metrics.http_reqs.values.rate,
        httpErrorRate: data.metrics.http_req_failed.values.rate,
        requestErrorRate: data.metrics.request_errors.values.rate,
        metrics: data,
    };
    return {
        [`${__ENV.RESULT_DIR}/summary.json`]: JSON.stringify(result, null, 2),
        stdout: JSON.stringify({ ...result, metrics: undefined }, null, 2) + '\n',
    };
}
