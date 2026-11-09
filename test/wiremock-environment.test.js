
"use strict";

const { HttpShippingPolicy, ShippingPolicyError } =
    require("../src/http-shipping-policy");

const {
    startWireMock,
    resetWireMock,
    configureShippingPolicy,
    getShippingPolicyRequests,
    stopWireMock
} = require("./wiremock-environment");

describe("WireMock HTTP environment", () => {
    let environment;
    let policy;

    beforeAll(async () => {
        environment = await startWireMock();
        policy = new HttpShippingPolicy(environment.baseUrl);
    }, 120000);

    beforeEach(async () => {
        await resetWireMock(environment.baseUrl);
    });

    afterAll(async () => {
        if (environment) {
            await stopWireMock(environment);
        }
    }, 30000);

    test("allows shipment through real HTTP request", async () => {
        await configureShippingPolicy(environment.baseUrl, 200, true);

        const allowed = await policy.isAllowed(
            { id: 1 },
            { id: 2 },
            100
        );

        expect(allowed).toBe(true);

        const requests = await getShippingPolicyRequests(environment.baseUrl);

        expect(requests).toHaveLength(1);
        expect(requests[0].method).toBe("POST");
        expect(requests[0].url).toBe("/shipping-policy");

        const body = JSON.parse(requests[0].body);

        expect(body).toEqual({
            customerId: 1,
            parcelId: 2,
            distanceKm: 100
        });
    });

    test("rejects shipment when HTTP policy denies it", async () => {
        await configureShippingPolicy(environment.baseUrl, 200, false);

        const allowed = await policy.isAllowed(
            { id: 1 },
            { id: 2 },
            100
        );

        expect(allowed).toBe(false);

        const requests = await getShippingPolicyRequests(environment.baseUrl);

        expect(requests).toHaveLength(1);
    });

    test("throws ShippingPolicyError on HTTP 503", async () => {
        await configureShippingPolicy(environment.baseUrl, 503);

        await expect(
            policy.isAllowed({ id: 1 }, { id: 2 }, 100)
        ).rejects.toThrow(ShippingPolicyError);

        const requests = await getShippingPolicyRequests(environment.baseUrl);

        expect(requests).toHaveLength(1);
    });
});
