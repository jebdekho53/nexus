// Local source-recovery extension. It reads constants; no application code runs.
#include <fstream>
#include <iomanip>
#include "src/objects/dictionary-inl.h"
#include "src/objects/descriptor-array-inl.h"
#include "src/objects/scope-info-inl.h"
#include "src/objects/bigint.h"
#include "src/bigint/bigint.h"
#include "src/objects/api-callbacks-inl.h"
#include "src/objects/struct-inl.h"
#include "src/interpreter/bytecode-array-iterator.h"

namespace ts_source_dump {
namespace i = v8::internal;

inline void String(std::ostream& out, const std::string& text) {
  out << '"';
  for (unsigned char ch : text) {
    if (ch == '"' || ch == '\\') out << '\\' << ch;
    else if (ch < 32) {
      out << "\\u00" << "0123456789abcdef"[ch >> 4]
          << "0123456789abcdef"[ch & 15];
    } else out << ch;
  }
  out << '"';
}

inline void Value(std::ostream&, i::Tagged<i::Object>, i::Isolate*, int);

inline void RegisterCounts(std::ostream& out, i::Tagged<i::BytecodeArray> bytecode, i::Isolate* isolate) {
  bool comma = false; out << '{';
  i::interpreter::BytecodeArrayIterator iterator(i::handle(bytecode, isolate));
  for (; !iterator.done(); iterator.Advance()) {
    auto op = iterator.current_bytecode();
    for (int operand = 0; operand < i::interpreter::Bytecodes::NumberOfOperands(op); ++operand) {
      if (i::interpreter::Bytecodes::GetOperandType(op, operand) != i::interpreter::OperandType::kRegCount) continue;
      if (comma) out << ','; comma = true;
      out << '"' << iterator.current_offset() << "\":" << iterator.GetRegisterCountOperand(operand);
    }
  }
  out << '}';
}

template <class Dictionary>
inline void DictionaryValue(std::ostream& out, i::Tagged<Dictionary> dict,
                            i::Isolate* isolate, int depth) {
  out << "{\"type\":\"properties\",\"entries\":[";
  bool comma = false;
  for (auto index : dict->IterateEntries()) {
    i::Tagged<i::Object> key;
    if (!dict->ToKey(index, &key)) continue;
    if (comma) out << ',';
    comma = true;
    out << '[';
    Value(out, key, isolate, depth + 1);
    out << ',';
    Value(out, dict->ValueAt(index), isolate, depth + 1);
    out << ',' << static_cast<int>(dict->DetailsAt(index).attributes()) << ','
        << dict->DetailsAt(index).dictionary_index() << ']';
  }
  out << "]}";
}

inline void Value(std::ostream& out, i::Tagged<i::Object> obj,
                  i::Isolate* isolate, int depth) {
  if (depth > 40) { out << "{\"type\":\"depth-limit\"}"; return; }
  i::ReadOnlyRoots roots(isolate);
  if (i::IsSmi(obj)) { out << i::Smi::ToInt(obj); return; }
  if (obj == roots.undefined_value()) { out << "{\"type\":\"undefined\"}"; return; }
  if (obj == roots.null_value()) { out << "null"; return; }
  if (obj == roots.true_value()) { out << "true"; return; }
  if (obj == roots.false_value()) { out << "false"; return; }
  if (obj == roots.the_hole_value()) { out << "{\"type\":\"hole\"}"; return; }
  if (obj == roots.uninitialized_value()) { out << "{\"type\":\"uninitialized\"}"; return; }
  if (i::IsHole(obj)) { out << "{\"type\":\"hole\"}"; return; }
  if (i::IsSymbol(obj)) {
    auto value = i::Cast<i::Symbol>(obj);
    out << "{\"type\":\"symbol\",\"id\":\"" << std::hex << obj.ptr() << std::dec
        << "\",\"private\":" << (value->is_any_private() ? "true" : "false")
        << ",\"description\":"; Value(out, value->description(), isolate, depth + 1); out << '}'; return;
  }
  if (i::IsBigInt(obj)) {
    auto value = i::Cast<i::BigInt>(obj);
    out << "{\"type\":\"bigint\",\"negative\":" << (value->IsNegative() ? "true" : "false") << ",\"digits\":[";
    for (uint32_t n = 0; n < value->length(); ++n) { if (n) out << ','; out << value->digits()[n]; }
    out << "]}"; return;
  }
  if (i::IsAccessorInfo(obj)) {
    out << "{\"type\":\"builtinAccessor\",\"name\":";
    Value(out, i::Cast<i::AccessorInfo>(obj)->name(), isolate, depth + 1); out << '}'; return;
  }
  if (i::IsTuple2(obj)) {
    auto value = i::Cast<i::Tuple2>(obj);
    out << "{\"type\":\"tuple\",\"values\":[";
    Value(out, value->value1(), isolate, depth + 1); out << ',';
    Value(out, value->value2(), isolate, depth + 1); out << "]}"; return;
  }
  if (i::IsClassPositions(obj)) {
    auto value = i::Cast<i::ClassPositions>(obj);
    out << "{\"type\":\"classPositions\",\"start\":" << value->start()
        << ",\"end\":" << value->end() << '}'; return;
  }
  if (i::IsString(obj)) { String(out, i::Cast<i::String>(obj)->ToStdString()); return; }
  if (i::IsHeapNumber(obj)) {
    double number = i::Cast<i::HeapNumber>(obj)->value();
    if (std::isfinite(number)) out << std::setprecision(17) << number;
    else { out << "{\"type\":\"number\",\"value\":"; String(out, std::isnan(number) ? "NaN" : number < 0 ? "-Infinity" : "Infinity"); out << '}'; }
    return;
  }
  if (i::IsSharedFunctionInfo(obj)) {
    out << "{\"type\":\"function\",\"id\":\"" << std::hex << obj.ptr()
        << std::dec << "\"}"; return;
  }
  if (i::IsScopeInfo(obj)) {
    auto scope = i::Cast<i::ScopeInfo>(obj);
    out << "{\"type\":\"scope\",\"length\":" << scope->ContextLength()
        << ",\"locals\":" << scope->ContextLocalCount() << '}'; return;
  }
  if (i::IsObjectBoilerplateDescription(obj)) {
    auto value = i::Cast<i::ObjectBoilerplateDescription>(obj);
    out << "{\"type\":\"object\",\"entries\":[";
    for (int n = 0; n < value->boilerplate_properties_count(); ++n) {
      if (n) out << ',';
      out << '['; Value(out, value->name(n), isolate, depth + 1);
      out << ','; Value(out, value->value(n), isolate, depth + 1); out << ']';
    }
    out << "]}"; return;
  }
  if (i::IsArrayBoilerplateDescription(obj)) {
    out << "{\"type\":\"array\",\"values\":";
    Value(out, i::Cast<i::ArrayBoilerplateDescription>(obj)->constant_elements(), isolate, depth + 1);
    out << '}'; return;
  }
  if (i::IsClassBoilerplate(obj)) {
    auto value = i::Cast<i::ClassBoilerplate>(obj);
    out << "{\"type\":\"class\",\"argc\":" << value->arguments_count();
    out << ",\"staticProperties\":"; Value(out, value->static_properties_template(), isolate, depth + 1);
    out << ",\"staticElements\":"; Value(out, value->static_elements_template(), isolate, depth + 1);
    out << ",\"staticComputed\":"; Value(out, value->static_computed_properties(), isolate, depth + 1);
    out << ",\"instanceProperties\":"; Value(out, value->instance_properties_template(), isolate, depth + 1);
    out << ",\"instanceElements\":"; Value(out, value->instance_elements_template(), isolate, depth + 1);
    out << ",\"instanceComputed\":"; Value(out, value->instance_computed_properties(), isolate, depth + 1);
    out << '}'; return;
  }
  if (i::IsAccessorPair(obj)) {
    auto pair = i::Cast<i::AccessorPair>(obj);
    out << "{\"type\":\"accessor\",\"get\":"; Value(out, pair->getter(), isolate, depth + 1);
    out << ",\"set\":"; Value(out, pair->setter(), isolate, depth + 1); out << '}'; return;
  }
  if (i::IsDescriptorArray(obj)) {
    auto value = i::Cast<i::DescriptorArray>(obj);
    out << "{\"type\":\"properties\",\"entries\":[";
    for (int n = 0; n < value->number_of_descriptors(); ++n) {
      if (n) out << ',';
      i::InternalIndex index(n);
      out << '['; Value(out, value->GetKey(index), isolate, depth + 1);
      out << ','; Value(out, value->GetStrongValue(index), isolate, depth + 1);
      out << ',' << static_cast<int>(value->GetDetails(index).attributes()) << ',' << n << ']';
    }
    out << "]}"; return;
  }
  if (i::IsNameDictionary(obj)) { DictionaryValue(out, i::Cast<i::NameDictionary>(obj), isolate, depth); return; }
  if (i::IsNumberDictionary(obj)) { DictionaryValue(out, i::Cast<i::NumberDictionary>(obj), isolate, depth); return; }
  if (i::IsFixedArray(obj)) {
    auto value = i::Cast<i::FixedArray>(obj); out << '[';
    for (uint32_t n = 0; n < value->length().value(); ++n) {
      if (n) out << ','; Value(out, value->get(n), isolate, depth + 1);
    }
    out << ']'; return;
  }
  if (i::IsFixedDoubleArray(obj)) {
    auto value = i::Cast<i::FixedDoubleArray>(obj); out << '[';
    for (uint32_t n = 0; n < value->length().value(); ++n) {
      if (n) out << ',';
      if (value->is_the_hole(n)) out << "{\"type\":\"hole\"}";
      else out << std::setprecision(17) << value->get_scalar(n);
    }
    out << ']'; return;
  }
  out << "{\"type\":\"unsupported\",\"instanceType\":"
      << static_cast<int>(i::Cast<i::HeapObject>(obj)->map()->instance_type()) << '}';
}
}  // namespace ts_source_dump
