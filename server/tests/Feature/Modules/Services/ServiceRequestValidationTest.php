<?php

use App\Modules\Services\Http\Requests\StoreServiceRequest;
use App\Modules\Services\Http\Requests\UpdateServiceRequest;
use Illuminate\Support\Facades\Validator;

// Pure validation-rule coverage for the FormRequest layer; no controllers or
// routes yet (Step 6.3). Requests are hydrated with their input via ::create()
// so conditional rules that inspect $this->filled(...) see real data.

test('store request accepts a valid payload', function () {
    $request = StoreServiceRequest::create('/api/admin/services', 'POST', [
        'name' => 'Virus Removal',
        'slug' => 'virus-removal',
        'description' => 'Full machine scan.',
        'price_min' => '1000',
        'price_max' => '5000',
        'duration_minutes' => 60,
        'is_published' => true,
    ]);

    expect(Validator::make($request->all(), $request->rules())->passes())->toBeTrue();
});

test('store request rejects price_min greater than price_max', function () {
    $request = StoreServiceRequest::create('/api/admin/services', 'POST', [
        'name' => 'Virus Removal',
        'price_min' => '5000',
        'price_max' => '1000',
        'duration_minutes' => 60,
    ]);

    $validator = Validator::make($request->all(), $request->rules());

    expect($validator->passes())->toBeFalse();
    expect($validator->errors()->has('price_min'))->toBeTrue();
});

test('store request rejects a non-positive duration and a non-numeric price', function () {
    $badDuration = StoreServiceRequest::create('/api/admin/services', 'POST', [
        'name' => 'Virus Removal',
        'price_min' => '1000',
        'price_max' => '5000',
        'duration_minutes' => 0,
    ]);

    $badPrice = StoreServiceRequest::create('/api/admin/services', 'POST', [
        'name' => 'Virus Removal',
        'price_min' => 'abc',
        'price_max' => '5000',
        'duration_minutes' => 60,
    ]);

    $durationValidator = Validator::make($badDuration->all(), $badDuration->rules());
    $priceValidator = Validator::make($badPrice->all(), $badPrice->rules());

    expect($durationValidator->passes())->toBeFalse();
    expect($durationValidator->errors()->has('duration_minutes'))->toBeTrue();

    expect($priceValidator->passes())->toBeFalse();
    expect($priceValidator->errors()->has('price_min'))->toBeTrue();
});

test('update request allows a lone price change and rejects an inverted pair', function () {
    $loneMax = UpdateServiceRequest::create('/api/admin/services/1', 'PUT', ['price_max' => '9000']);
    expect(Validator::make($loneMax->all(), $loneMax->rules())->passes())->toBeTrue();

    $loneMin = UpdateServiceRequest::create('/api/admin/services/1', 'PUT', ['price_min' => '1000']);
    expect(Validator::make($loneMin->all(), $loneMin->rules())->passes())->toBeTrue();

    $inverted = UpdateServiceRequest::create('/api/admin/services/1', 'PUT', [
        'price_min' => '5000',
        'price_max' => '1000',
    ]);
    $invertedValidator = Validator::make($inverted->all(), $inverted->rules());

    expect($invertedValidator->passes())->toBeFalse();
    expect($invertedValidator->errors()->has('price_min'))->toBeTrue();

    $validPair = UpdateServiceRequest::create('/api/admin/services/1', 'PUT', [
        'price_min' => '1000',
        'price_max' => '5000',
    ]);
    expect(Validator::make($validPair->all(), $validPair->rules())->passes())->toBeTrue();
});

test('update request exposes no is_published field', function () {
    $request = UpdateServiceRequest::create('/api/admin/services/1', 'PUT', ['is_published' => true]);

    expect($request->rules())->not->toHaveKey('is_published');
    expect(Validator::make($request->all(), $request->rules())->errors()->any())->toBeFalse();
});
