
"use strict";

const {
    startTestDatabase,
    stopTestDatabase
} = require("./container-environment");

const {
    startWireMock,
    stopWireMock,
    resetWireMock,
    configureShippingPolicy,
    getShippingPolicyRequests
} = require("./wiremock-environment");

const {
    CustomerRepository,
    ParcelRepository,
    ShipmentRepository
} = require("../src/repositories");

const {
    Customer,
    Parcel,
    ShipmentRequest,
    ShipmentStatus
} = require("../src/models");

const {
    ShippingService,
    ShipmentRejectedError
} = require("../src/service");

const {
    HttpShippingPolicy,
    ShippingPolicyError
} = require("../src/http-shipping-policy");

describe("ShippingService isolated integration tests", () => {
    let database;
    let wiremock;
    let customers;
    let parcels;
    let shipments;
    let service;

    beforeAll(async () => {
        database = await startTestDatabase();

        try {
            wiremock = await startWireMock();
        } catch (error) {
            await stopTestDatabase(database);
            database = null;
            throw error;
        }
    }, 180000);

    beforeEach(async () => {
        await database.client.query(
            "TRUNCATE TABLE shipments, parcels, customers RESTART IDENTITY CASCADE"
        );

        await resetWireMock(wiremock.baseUrl);

        customers = new CustomerRepository(database.client);
        parcels = new ParcelRepository(database.client);
        shipments = new ShipmentRepository(database.client);

        const policy = new HttpShippingPolicy(wiremock.baseUrl);

        service = new ShippingService(
            customers,
            parcels,
            shipments,
            policy
        );
    });

    afterAll(async () => {
        if (wiremock) {
            await stopWireMock(wiremock);
        }

        if (database) {
            await stopTestDatabase(database);
        }
    }, 60000);

    async function createCustomer(regular = false) {
        return customers.create(
            new Customer(0, "CUSTOMER-001", regular)
        );
    }

    async function createParcel(weightGrams = 1000) {
        return parcels.create(
            new Parcel(
                0,
                "PARCEL-001",
                weightGrams,
                50000,
                10,
                10,
                10
            )
        );
    }

    async function countShipments() {
        const result = await database.client.query(
            "SELECT COUNT(*)::int AS count FROM shipments"
        );

        return result.rows[0].count;
    }

    test("creates shipment with regular customer discount and persists state", async () => {
        await configureShippingPolicy(wiremock.baseUrl, 200, true);

        const customer = await createCustomer(true);
        const parcel = await createParcel(5000);

        const result = await service.createShipment(
            new ShipmentRequest(
                "SHIPMENT-SUCCESS",
                customer.id,
                parcel.id,
                100
            )
        );

        expect(result.status).toBe(ShipmentStatus.REGISTERED);
        expect(result.baseFee).toBe(11000);
        expect(result.adjustment).toBe(-1100);
        expect(result.total).toBe(9900);

        const saved = await shipments.findById(result.id);

        expect(saved).not.toBeNull();
        expect(saved.reference).toBe("SHIPMENT-SUCCESS");
        expect(saved.customerId).toBe(customer.id);
        expect(saved.parcelId).toBe(parcel.id);
        expect(saved.status).toBe(ShipmentStatus.REGISTERED);
        expect(saved.total).toBe(9900);

        expect(await countShipments()).toBe(1);

        const requests = await getShippingPolicyRequests(wiremock.baseUrl);

        expect(requests).toHaveLength(1);
        expect(requests[0].method).toBe("POST");
        expect(requests[0].url).toBe("/shipping-policy");

        expect(JSON.parse(requests[0].body)).toEqual({
            customerId: customer.id,
            parcelId: parcel.id,
            distanceKm: 100
        });
    });

    test("rejects shipment when external policy denies delivery", async () => {
        await configureShippingPolicy(wiremock.baseUrl, 200, false);

        const customer = await createCustomer();
        const parcel = await createParcel();

        await expect(
            service.createShipment(
                new ShipmentRequest(
                    "SHIPMENT-DENIED",
                    customer.id,
                    parcel.id,
                    100
                )
            )
        ).rejects.toThrow(ShipmentRejectedError);

        expect(await countShipments()).toBe(0);

        const requests = await getShippingPolicyRequests(wiremock.baseUrl);

        expect(requests).toHaveLength(1);
        expect(requests[0].method).toBe("POST");
        expect(requests[0].url).toBe("/shipping-policy");

        expect(JSON.parse(requests[0].body)).toEqual({
            customerId: customer.id,
            parcelId: parcel.id,
            distanceKm: 100
        });
    });

    test("does not create shipment when external service returns HTTP 503", async () => {
        await configureShippingPolicy(wiremock.baseUrl, 503);

        const customer = await createCustomer();
        const parcel = await createParcel();

        await expect(
            service.createShipment(
                new ShipmentRequest(
                    "SHIPMENT-UNAVAILABLE",
                    customer.id,
                    parcel.id,
                    100
                )
            )
        ).rejects.toThrow(ShippingPolicyError);

        expect(await countShipments()).toBe(0);

        const requests = await getShippingPolicyRequests(wiremock.baseUrl);

        expect(requests).toHaveLength(1);
        expect(requests[0].method).toBe("POST");
        expect(requests[0].url).toBe("/shipping-policy");

        expect(JSON.parse(requests[0].body)).toEqual({
            customerId: customer.id,
            parcelId: parcel.id,
            distanceKm: 100
        });
    });

    test("rejects invalid distance locally without HTTP request", async () => {
        await configureShippingPolicy(wiremock.baseUrl, 200, true);

        const customer = await createCustomer();
        const parcel = await createParcel();

        await expect(
            service.createShipment(
                new ShipmentRequest(
                    "SHIPMENT-INVALID",
                    customer.id,
                    parcel.id,
                    0
                )
            )
        ).rejects.toThrow(RangeError);

        expect(await countShipments()).toBe(0);

        const requests = await getShippingPolicyRequests(wiremock.baseUrl);

        expect(requests).toHaveLength(0);
    });
});
