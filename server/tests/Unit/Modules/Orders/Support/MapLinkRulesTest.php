<?php

use App\Modules\Orders\Support\MapLinkRules;
use Illuminate\Support\Facades\Validator;

it('accepts allowed map links', function (string $mapLink) {
    $validator = Validator::make(
        ['map_link' => $mapLink],
        ['map_link' => MapLinkRules::required()],
    );

    expect($validator->passes())->toBeTrue();
})->with([
    'https://www.google.com/maps/place/Lahore',
    'https://google.com/maps?q=Lahore',
    'https://maps.google.com/?q=Lahore',
    'https://maps.app.goo.gl/abc123',
    'https://goo.gl/maps/abc123',
]);

it('rejects disallowed map links', function (string $mapLink) {
    $validator = Validator::make(
        ['map_link' => $mapLink],
        ['map_link' => MapLinkRules::required()],
    );

    expect($validator->fails())->toBeTrue();
    expect($validator->errors()->has('map_link'))->toBeTrue();
})->with([
    'http://maps.app.goo.gl/abc123',
    'https://evil.test/maps',
    'https://google.com.evil.test/maps?q=x',
    'https://evilgoogle.com/maps?q=x',
    'https://user:pass@maps.app.goo.gl/abc123',
    'javascript:alert(1)',
    'data:text/html,hello',
    'https://google.com/search?q=Lahore',
    'https://www.google.com/search?q=Lahore',
    'https://goo.gl/notmaps/abc123',
    'ftp://maps.app.goo.gl/abc123',
]);

it('rejects over-500-length map links', function () {
    $longLink = 'https://maps.app.goo.gl/'.str_repeat('a', 500);

    $validator = Validator::make(
        ['map_link' => $longLink],
        ['map_link' => MapLinkRules::required()],
    );

    expect($validator->fails())->toBeTrue();
});

it('requires map_link in required mode', function () {
    $validator = Validator::make(
        [],
        ['map_link' => MapLinkRules::required()],
    );

    expect($validator->fails())->toBeTrue();
});

it('allows omitting map_link in sometimes mode', function () {
    $validator = Validator::make(
        [],
        ['map_link' => MapLinkRules::sometimes()],
    );

    expect($validator->passes())->toBeTrue();
});

it('rejects empty map_link in sometimes mode', function () {
    $validator = Validator::make(
        ['map_link' => ''],
        ['map_link' => MapLinkRules::sometimes()],
    );

    // TrimStrings/ConvertEmptyStringsToNull run in HTTP; in direct validator this is empty string.
    // Rule should still reject empty value when provided.
    expect($validator->fails())->toBeTrue();
});
