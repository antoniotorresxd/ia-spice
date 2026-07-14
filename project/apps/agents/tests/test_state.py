from agents.state import merge_dicts


def test_merge_dicts_merges_by_top_level_key():
    left = {"b1": {"r1": 1000}, "b2": {"r": 150}}
    right = {"b2": {"r": 141}}

    merged = merge_dicts(left, right)

    assert merged == {"b1": {"r1": 1000}, "b2": {"r": 141}}


def test_merge_dicts_tolerates_none_sides():
    assert merge_dicts(None, {"a": 1}) == {"a": 1}
    assert merge_dicts({"a": 1}, None) == {"a": 1}
    assert merge_dicts(None, None) == {}
