
"use strict";

const request = require("supertest");
const { createApp } = require("../src/api");
const {
    startTestDatabase,
    stopTestDatabase
} = require("./container-environment");

describe("Shipping REST API integration tests", () => {
    let database;
    let app;
    let previousEnv;

    beforeAll(async () => {
        database = await startTestDatabase();

        previousEnv = {
            DB_HOST: process.env.DB_HOST,
            DB_PORT: process.env.DB_PORT,
            DB_NAME: process.env.DB_NAME,
            DB_USER: process.env.DB_USER,
            DB_PASSWORD: process.env.DB_PASSWORD,
            SHIPPING_POLICY_URL: process.env.SHIPPING_POLICY_URL
        };

        process.env.DB_HOST = database.container.getHost();
        process.env.DB_PORT = String(database.container.getPort());
        process.env.DB_NAME = database.container.getDatabase();
        process.env.DB_USER = database.container.getUsername();
        process.env.DB_PASSWORD = database.container.getPassword();

        delete process.env.SHIPPING_POLICY_URL;

        app = createApp();
    }, 180000);

    beforeEach(async () => {
        await database.client.query(
            "TRUNCATE TABLE shipments, parcels, customers RESTART IDENTITY CASCADE"
        );
    });

    afterAll(async () => {
        if (previousEnv) {
            for (const [key, value] of Object.entries(previousEnv)) {
                if (value === undefined) {
                    delete process.env[key];
                } else {
                    process.env[key] = value;
                }
            }
        }

        if (database) {
            await stopTestDatabase(database);
        }
    }, 60000);

    async function createCustomer(regular = false) {
        const response = await request(app)
            .post("/customers")
            .send({
                code: "CUSTOMER-001",
                regular
            })
            .expect(201);

        return response.body;
    }

    async function createParcel(weightGrams = 5000) {
        const response = await request(app)
            .post("/parcels")
            .send({
                code: "PARCEL-001",
                weightGrams,
                declaredValue: 50000,
                lengthCm: 10,
                widthCm: 10,
                heightCm: 10
            })
            .expect(201);

        return response.body;
    }

    async function createShipment(regular = false, weightGrams = 5000) {
        const customer = await createCustomer(regular);
        const parcel = await createParcel(weightGrams);

        const response = await request(app)
            .post("/shipments")
            .send({
                reference: "SHIPMENT-001",
                customerId: customer.id,
                parcelId: parcel.id,
                distanceKm: 100,
                urgent: false,
                pickup: false
            })
            .expect(201);

        return response.body;
    }

    test("POST creates shipment and returns status 201", async () => {
        const shipment = await createShipment();

        expect(shipment.id).toBeGreaterThan(0);
        expect(shipment.reference).toBe("SHIPMENT-001");
        expect(shipment.status).toBe("Registered");
        expect(shipment.total).toBe(11000);
    });

    test("GET returns created shipment by ID", async () => {
        const shipment = await createShipment();

        const response = await request(app)
            .get(`/shipments/${shipment.id}`)
            .expect(200);

        expect(response.body.id).toBe(shipment.id);
        expect(response.body.reference).toBe(shipment.reference);
        expect(response.body.total).toBe(shipment.total);
        expect(response.body.status).toBe("Registered");
    });

    test("GET returns 404 for nonexistent shipment", async () => {
        const response = await request(app)
            .get("/shipments/999999")
            .expect(404);

        expect(response.body.code).toBe("NOT_FOUND");
        expect(response.body.message).toBe("Відправлення не знайдено");
    });

    test("POST cancel changes shipment status to Cancelled", async () => {
        const shipment = await createShipment();

        const response = await request(app)
            .post(`/shipments/${shipment.id}/cancel`)
            .expect(200);

        expect(response.body.status).toBe("Cancelled");
        expect(response.body.refund).toBe(shipment.total);
    });

    test("repeated cancellation returns 409 conflict", async () => {
        const shipment = await createShipment();

        await request(app)
            .post(`/shipments/${shipment.id}/cancel`)
            .expect(200);

        const response = await request(app)
            .post(`/shipments/${shipment.id}/cancel`)
            .expect(409);

        expect(response.body.code).toBe("SHIPMENT_CONFLICT");
        expect(response.body.message).toBe("Перехід статусу заборонений");
    });

    test("GET confirms state remains unchanged after 409", async () => {
        const shipment = await createShipment();

        await request(app)
            .post(`/shipments/${shipment.id}/cancel`)
            .expect(200);

        await request(app)
            .post(`/shipments/${shipment.id}/cancel`)
            .expect(409);

        const response = await request(app)
            .get(`/shipments/${shipment.id}`)
            .expect(200);

        expect(response.body.status).toBe("Cancelled");
        expect(response.body.refund).toBe(shipment.total);
    });

    test.each([
        [true, -1100, 9900],
        [false, 0, 11000]
    ])(
        "calculates discount for regular=%s",
        async (regular, expectedAdjustment, expectedTotal) => {
            const shipment = await createShipment(regular);

            expect(shipment.baseFee).toBe(11000);
            expect(shipment.adjustment).toBe(expectedAdjustment);
            expect(shipment.total).toBe(expectedTotal);
        }
    );

    test("completes POST GET dispatch GET workflow", async () => {
        const shipment = await createShipment();

        const before = await request(app)
            .get(`/shipments/${shipment.id}`)
            .expect(200);

        expect(before.body.status).toBe("Registered");

        const action = await request(app)
            .post(`/shipments/${shipment.id}/dispatch`)
            .expect(200);

        expect(action.body.status).toBe("Dispatched");

        const after = await request(app)
            .get(`/shipments/${shipment.id}`)
            .expect(200);

        expect(after.body.id).toBe(shipment.id);
        expect(after.body.status).toBe("Dispatched");
    });

    test("cannot deliver shipment before dispatch", async () => {
        const shipment = await createShipment();

        const response = await request(app)
            .post(`/shipments/${shipment.id}/deliver`)
            .expect(409);

        expect(response.body.code).toBe("SHIPMENT_CONFLICT");

        const after = await request(app)
            .get(`/shipments/${shipment.id}`)
            .expect(200);

        expect(after.body.status).toBe("Registered");
    });
});
