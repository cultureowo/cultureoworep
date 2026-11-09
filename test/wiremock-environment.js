
"use strict";

const { GenericContainer, Wait } = require("testcontainers");

async function startWireMock() {
    const container = await new GenericContainer("wiremock/wiremock:3.13.1")
        .withExposedPorts(8080)
        .withWaitStrategy(Wait.forHttp("/__admin/health", 8080).forStatusCode(200))
        .withStartupTimeout(120000)
        .start();

    const baseUrl = `http://${container.getHost()}:${container.getMappedPort(8080)}`;

    return {
        container,
        baseUrl
    };
}

async function resetWireMock(baseUrl) {
    const response = await fetch(`${baseUrl}/__admin/reset`, {
        method: "POST"
    });

    if (!response.ok) {
        throw new Error(`WireMock reset failed: ${response.status}`);
    }
}

async function configureShippingPolicy(baseUrl, status, allowed) {
    const responseBody = allowed === undefined
        ? {}
        : { allowed };

    const response = await fetch(`${baseUrl}/__admin/mappings`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            request: {
                method: "POST",
                url: "/shipping-policy"
            },
            response: {
                status,
                headers: {
                    "Content-Type": "application/json"
                },
                jsonBody: responseBody
            }
        })
    });

    if (!response.ok) {
        throw new Error(`WireMock configuration failed: ${response.status}`);
    }
}

async function getShippingPolicyRequests(baseUrl) {
    const response = await fetch(
        `${baseUrl}/__admin/requests/find`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                method: "POST",
                url: "/shipping-policy"
            })
        }
    );

    if (!response.ok) {
        throw new Error(`WireMock verification failed: ${response.status}`);
    }

    const result = await response.json();
    return result.requests;
}

async function stopWireMock(environment) {
    await environment.container.stop();
}

module.exports = {
    startWireMock,
    resetWireMock,
    configureShippingPolicy,
    getShippingPolicyRequests,
    stopWireMock
};
