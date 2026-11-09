const fs = require('node:fs');
const path = require('node:path');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const prop = (name, value) => `<stringProp name="${name}">${escape(value)}</stringProp>`;
const bool = (name, value) => `<boolProp name="${name}">${value}</boolProp>`;
function scriptElement(type, name, script) {
    return `<${type} guiclass="TestBeanGUI" testclass="${type}" testname="${name}" enabled="true">${prop('scriptLanguage', 'groovy')}${prop('cacheKey', 'true')}${prop('script', script)}</${type}><hashTree/>`;
}
function request(method, url, body, idName, validation, guarded = false) {
    const sampler = `<HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="${escape(method + ' ' + (method === 'GET' ? '/shipments/:id' : url))}" enabled="true">
    <elementProp name="HTTPsampler.Arguments" elementType="Arguments"><collectionProp name="Arguments.arguments">${body ? `<elementProp name="" elementType="HTTPArgument">${bool('HTTPArgument.always_encode', false)}${prop('Argument.value', JSON.stringify(body))}${prop('Argument.metadata', '=')}</elementProp>` : ''}</collectionProp></elementProp>
    ${prop('HTTPSampler.domain', '127.0.0.1')}${prop('HTTPSampler.port', '8080')}${prop('HTTPSampler.protocol', 'http')}${prop('HTTPSampler.path', url)}${prop('HTTPSampler.method', method)}${bool('HTTPSampler.postBodyRaw', true)}${bool('HTTPSampler.use_keepalive', true)}${bool('HTTPSampler.follow_redirects', false)}${prop('HTTPSampler.connect_timeout', '2000')}${prop('HTTPSampler.response_timeout', '2000')}
    </HTTPSamplerProxy><hashTree>
    ${idName ? `<JSONPostProcessor guiclass="TestBeanGUI" testclass="JSONPostProcessor" testname="Extract ${idName}" enabled="true">${prop('JSONPostProcessor.referenceNames', idName)}${prop('JSONPostProcessor.jsonPathExprs', '$.id')}${prop('JSONPostProcessor.match_numbers', '1')}${prop('JSONPostProcessor.defaultValues', 'MISSING')}</JSONPostProcessor><hashTree/>` : ''}
    ${scriptElement('JSR223Assertion', 'Check status and body', `try {
        def d = new groovy.json.JsonSlurper().parseText(prev.getResponseDataAsString())
        if (prev.getResponseCode() != '${method === 'GET' ? '200' : '201'}' || !(${validation})) {
            AssertionResult.setFailure(true); AssertionResult.setFailureMessage('Unexpected status or response body')
        }
    } catch (Exception e) { AssertionResult.setFailure(true); AssertionResult.setFailureMessage(e.toString()) }`)}
    </hashTree>`;
    if (!guarded) return sampler;
    return `<IfController guiclass="IfControllerPanel" testclass="IfController" testname="Continue if previous request passed" enabled="true">${prop('IfController.condition', '${JMeterThread.last_sample_ok}')}${bool('IfController.useExpression', true)}${bool('IfController.evaluateAll', false)}</IfController><hashTree>${sampler}</hashTree>`;
}
function threadGroup(name, count, ramp, delay, duration) {
    const key = '${key}';
    return `<ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="${name}" enabled="true">
    ${prop('ThreadGroup.on_sample_error', 'continue')}
    <elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControlPanel" testclass="LoopController" testname="Loop">${bool('LoopController.continue_forever', false)}${prop('LoopController.loops', '-1')}</elementProp>
    ${prop('ThreadGroup.num_threads', count)}${prop('ThreadGroup.ramp_time', ramp)}${bool('ThreadGroup.scheduler', true)}${prop('ThreadGroup.duration', duration)}${prop('ThreadGroup.delay', delay)}${bool('ThreadGroup.same_user_on_next_iteration', true)}
    </ThreadGroup><hashTree>
    ${scriptElement('JSR223PreProcessor', 'Unique iteration data', "if (sampler.getName() == 'POST /customers') { vars.put('key', java.util.UUID.randomUUID().toString()) }")}
    <HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="JSON headers" enabled="true"><collectionProp name="HeaderManager.headers"><elementProp name="" elementType="Header">${prop('Header.name', 'Content-Type')}${prop('Header.value', 'application/json')}</elementProp></collectionProp></HeaderManager><hashTree/>
    ${request('POST', '/customers', { code: `C-${key}`, regular: false }, 'customerId', 'd.id instanceof Number && d.id > 0')}
    ${request('POST', '/parcels', { code: `P-${key}`, weightGrams: 5000, declaredValue: 50000, lengthCm: 10, widthCm: 10, heightCm: 10 }, 'parcelId', 'd.id instanceof Number && d.id > 0', true)}
    ${request('POST', '/shipments', { reference: `S-${key}`, customerId: '__CUSTOMER_ID__', parcelId: '__PARCEL_ID__', distanceKm: 100, urgent: false, pickup: false }, 'shipmentId', "d.id instanceof Number && d.id > 0 && d.customerId.toString() == vars.get('customerId') && d.parcelId.toString() == vars.get('parcelId') && d.status == 'Registered' && d.total == 11000", true)}
    ${request('GET', '/shipments/${shipmentId}', null, null, "d.id.toString() == vars.get('shipmentId') && d.customerId.toString() == vars.get('customerId') && d.parcelId.toString() == vars.get('parcelId') && d.reference == 'S-' + vars.get('key') && d.status == 'Registered' && d.total == 11000", true)}
    <TestAction guiclass="TestActionGui" testclass="TestAction" testname="Pause 1 second after iteration" enabled="true">${prop('ActionProcessor.action', '1')}${prop('ActionProcessor.target', '0')}${prop('ActionProcessor.duration', '1000')}</TestAction><hashTree/>
    </hashTree>`;
}
const profiles = {
    baseline: [['1 user', 1, 0, 0, 50]],
    load: [['Ramp to 10', 10, 10, 0, 50]],
    stress: [['First 10', 10, 10, 0, 50], ['Add 15 at 10s', 15, 10, 10, 40], ['Add 25 at 20s', 25, 10, 20, 30]],
};
for (const [profile, groups] of Object.entries(profiles)) {
    let xml = `<?xml version="1.0" encoding="UTF-8"?><jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3"><hashTree><TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="Shipping ${profile}" enabled="true">${bool('TestPlan.serialize_threadgroups', false)}<elementProp name="TestPlan.user_defined_variables" elementType="Arguments"><collectionProp name="Arguments.arguments"/></elementProp></TestPlan><hashTree>${groups.map(g => threadGroup(...g)).join('')}</hashTree></hashTree></jmeterTestPlan>`;
    xml = xml.replaceAll('&quot;__CUSTOMER_ID__&quot;', '${customerId}').replaceAll('&quot;__PARCEL_ID__&quot;', '${parcelId}');
    fs.writeFileSync(path.join(__dirname, `shipping-${profile}.jmx`), xml);
}
