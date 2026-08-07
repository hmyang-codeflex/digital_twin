/// <summary>
/// 홈(Hole)에 볼트가 들어가 있는지 판정하는 검사기 공통 인터페이스.
/// HoleBoltInspector(물리 콜라이더 기반)와 AiInspector(AI 모델 기반)가 모두 구현하여,
/// BoltingInspectionTask가 판정 방식에 상관없이 동일한 방법으로 검사할 수 있도록 합니다.
/// </summary>
public interface IBoltInspector
{
    bool IsBoltPresent();

    /// <summary>방금 IsBoltPresent()가 반환한 판정을 "이번 시도에 사용함"으로 표시합니다.
    /// 물리 콜라이더 기반 검사기처럼 매 호출이 항상 최신 상태인 경우는 아무 것도 할 필요가
    /// 없고, AiInspector처럼 외부에서 폴링해온 결과를 캐싱하는 경우는 다음 시도에서 같은
    /// 결과를 재사용하지 않도록 여기서 소비 처리합니다. VerifyRetryInstruction이 검사 직후 호출합니다.</summary>
    void ConsumeResult() { }
}
