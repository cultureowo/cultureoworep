"use strict";

const { connect } = require("../src/database");

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

describe("ShippingService integration tests", () => {
    let client;
    let customers;
    let parcels;
    let shipments;
    let policy;
    let service;

    beforeAll(async () => {
        client = await connect();

        customers = new CustomerRepository(client);
        parcels = new ParcelRepository(client);
        shipments = new ShipmentRepository(client);
    });

    beforeEach(async () => {
        await client.query(
            "TRUNCATE TABLE shipments, parcels, customers RESTART IDENTITY CASCADE"
        );

        policy = {
            isAllowed: jest.fn().mockResolvedValue(true)
        };

        service = new ShippingService(
            customers,
            parcels,
            shipments,
            policy
        );
    });

    afterAll(async () => {
        await client.end();
    });

    async function createCustomer(regular = false) {
        return customers.create(
            new Customer(
                0,
                regular ? "REGULAR-CUSTOMER" : "CUSTOMER",
                regular
            )
        );
    }

    async function createParcel(
        weightGrams = 1000,
        declaredValue = 50000
    ) {
        return parcels.create(
            new Parcel(
                0,
                "PARCEL-001",
                weightGrams,
                declaredValue,
                10,
                10,
                10
            )
        );
    }

    test("creates shipment successfully_serviceState", async () => {
        const customer = await createCustomer(false);
        const parcel = await createParcel();

        const request = new ShipmentRequest(
            "SHIPMENT-001",
            customer.id,
            parcel.id,
            100,
            false,
            false
        );

        const result = await service.createShipment(request);

        expect(result.id).toBeGreaterThan(0);
        expect(result.reference).toBe("SHIPMENT-001");
        expect(result.customerId).toBe(customer.id);
        expect(result.parcelId).toBe(parcel.id);
        expect(result.status).toBe(ShipmentStatus.REGISTERED);

        expect(result.baseFee).toBe(7000);
        expect(result.adjustment).toBe(0);
        expect(result.total).toBe(7000);
    });

    test("persists created shipment in database_persistedState", async () => {
        const customer = await createCustomer(false);
        const parcel = await createParcel();

        const request = new ShipmentRequest(
            "SHIPMENT-001",
            customer.id,
            parcel.id,
            100,
            false,
            false
        );

        const result = await service.createShipment(request);

        const stored = await shipments.findById(result.id);

        expect(stored).not.toBeNull();
        expect(stored.id).toBe(result.id);
        expect(stored.reference).toBe("SHIPMENT-001");
        expect(stored.customerId).toBe(customer.id);
        expect(stored.parcelId).toBe(parcel.id);
        expect(stored.status).toBe(ShipmentStatus.REGISTERED);
        expect(stored.total).toBe(7000);
    });

    test("applies ten percent discount for regular customer_serviceState", async () => {
        const customer = await createCustomer(true);
        const parcel = await createParcel(5000);

        const request = new ShipmentRequest(
            "SHIPMENT-DISCOUNT",
            customer.id,
            parcel.id,
            100,
            false,
            false
        );

        const result = await service.createShipment(request);

        expect(result.baseFee).toBe(11000);
        expect(result.adjustment).toBe(-1100);
        expect(result.total).toBe(9900);

        const stored = await shipments.findById(result.id);

        expect(stored.baseFee).toBe(11000);
        expect(stored.adjustment).toBe(-1100);
        expect(stored.total).toBe(9900);
    });

    test("does not apply discount below threshold for regular customer", async () => {
        const customer = await createCustomer(true);
        const parcel = await createParcel(1000);

        const request = new ShipmentRequest(
            "SHIPMENT-NO-DISCOUNT",
            customer.id,
            parcel.id,
            100,
            false,
            false
        );

        const result = await service.createShipment(request);

        expect(result.baseFee).toBe(7000);
        expect(result.adjustment).toBe(0);
        expect(result.total).toBe(7000);

        const stored = await shipments.findById(result.id);

        expect(stored.adjustment).toBe(0);
        expect(stored.total).toBe(7000);
    });

    test("rejects shipment when policy denies delivery", async () => {
        const customer = await createCustomer(false);
        const parcel = await createParcel();

        policy.isAllowed.mockResolvedValue(false);

        const request = new ShipmentRequest(
            "SHIPMENT-REJECTED",
            customer.id,
            parcel.id,
            100,
            false,
            false
        );

        await expect(
            service.createShipment(request)
        ).rejects.toThrow(ShipmentRejectedError);

        const result = await client.query(
            "SELECT COUNT(*)::int AS count FROM shipments"
        );

        expect(result.rows[0].count).toBe(0);
    });

    test("dispatches registered shipment and persists new status", async () => {
        const customer = await createCustomer(false);
        const parcel = await createParcel();

        const created = await service.createShipment(
            new ShipmentRequest(
                "SHIPMENT-DISPATCH",
                customer.id,
                parcel.id,
                100
            )
        );

        const dispatched = await service.dispatch(created.id);

        expect(dispatched.status).toBe(ShipmentStatus.DISPATCHED);

        const stored = await shipments.findById(created.id);

        expect(stored.status).toBe(ShipmentStatus.DISPATCHED);
        expect(stored.refund).toBe(0);
    });

    test("delivers dispatched shipment and persists new status", async () => {
        const customer = await createCustomer(false);
        const parcel = await createParcel();

        const created = await service.createShipment(
            new ShipmentRequest(
                "SHIPMENT-DELIVER",
                customer.id,
                parcel.id,
                100
            )
        );

        await service.dispatch(created.id);

        const delivered = await service.deliver(created.id);

        expect(delivered.status).toBe(ShipmentStatus.DELIVERED);

        const stored = await shipments.findById(created.id);

        expect(stored.status).toBe(ShipmentStatus.DELIVERED);
        expect(stored.refund).toBe(0);
    });

    test("cancels registered shipment and persists full refund", async () => {
        const customer = await createCustomer(false);
        const parcel = await createParcel();

        const created = await service.createShipment(
            new ShipmentRequest(
                "SHIPMENT-CANCEL",
                customer.id,
                parcel.id,
                100
            )
        );

        const cancelled = await service.cancel(created.id);

        expect(cancelled.status).toBe(ShipmentStatus.CANCELLED);
        expect(cancelled.refund).toBe(created.total);

        const stored = await shipments.findById(created.id);

        expect(stored.status).toBe(ShipmentStatus.CANCELLED);
        expect(stored.refund).toBe(created.total);
    });

    test("rejects invalid status transition", async () => {
        const customer = await createCustomer(false);
        const parcel = await createParcel();

        const created = await service.createShipment(
            new ShipmentRequest(
                "SHIPMENT-INVALID-STATUS",
                customer.id,
                parcel.id,
                100
            )
        );

        await service.dispatch(created.id);

        await expect(
            service.cancel(created.id)
        ).rejects.toThrow(ShipmentRejectedError);

        const stored = await shipments.findById(created.id);

        expect(stored.status).toBe(ShipmentStatus.DISPATCHED);
        expect(stored.refund).toBe(0);
    });

    test("does not create shipment when customer does not exist", async () => {
        const parcel = await createParcel();

        const request = new ShipmentRequest(
            "SHIPMENT-NO-CUSTOMER",
            999999,
            parcel.id,
            100
        );

        await expect(
            service.createShipment(request)
        ).rejects.toThrow("Клієнта не знайдено");

        const result = await client.query(
            "SELECT COUNT(*)::int AS count FROM shipments"
        );

        expect(result.rows[0].count).toBe(0);
    });

    test("does not create shipment when parcel does not exist", async () => {
        const customer = await createCustomer(false);

        const request = new ShipmentRequest(
            "SHIPMENT-NO-PARCEL",
            customer.id,
            999999,
            100
        );

        await expect(
            service.createShipment(request)
        ).rejects.toThrow("Посилку не знайдено");

        const result = await client.query(
            "SELECT COUNT(*)::int AS count FROM shipments"
        );

        expect(result.rows[0].count).toBe(0);
    });
    test("new shipment is persisted with Registered status", async () => {
        const customer = await createCustomer(false);
        const parcel = await createParcel();

        const request = new ShipmentRequest(
            "SHIPMENT-INTENTIONAL-FAIL",
            customer.id,
            parcel.id,
            100,
            false,
            false
        );

        const result = await service.createShipment(request);

        const stored = await shipments.findById(result.id);

        expect(stored.status).toBe(ShipmentStatus.CANCELLED);
    });
});